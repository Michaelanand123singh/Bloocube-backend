// src/services/social/twitter.js
const axios = require('axios');
const crypto = require('crypto');
const config = require('../../config/env');

class TwitterService {
  constructor() {
    this.clientId = config.TWITTER_CLIENT_ID;
    this.clientSecret = config.TWITTER_CLIENT_SECRET;
    this.baseURL = 'https://api.twitter.com/2';
    this.uploadURL = 'https://upload.twitter.com/1.1'; // Fixed: Added missing uploadURL
    this.authURL = 'https://twitter.com/i/oauth2/authorize';
    this.tokenURL = 'https://api.twitter.com/2/oauth2/token';
    this.codeVerifiers = new Map();
  }

  generateAuthURL(redirectUri, state) {
    const codeVerifier = crypto.randomBytes(32).toString('base64url');
    const codeChallenge = crypto
      .createHash('sha256')
      .update(codeVerifier)
      .digest('base64url');

    this.codeVerifiers.set(state, codeVerifier);

    const params = new URLSearchParams({
      response_type: 'code',
      client_id: this.clientId,
      redirect_uri: redirectUri,
      scope: config.TWITTER_SCOPES || 'tweet.read users.read offline.access', // Fallback scopes
      state,
      code_challenge: codeChallenge,
      code_challenge_method: 'S256',
    });

    return `${this.authURL}?${params.toString()}`;
  }

  async exchangeCodeForToken(code, redirectUri, state) {
    try {
      const codeVerifier = this.codeVerifiers.get(state);
      if (!codeVerifier) {
        throw new Error('Code verifier not found for state');
      }

      const credentials = Buffer.from(`${this.clientId}:${this.clientSecret}`).toString('base64');

      const params = new URLSearchParams();
      params.append('code', code);
      params.append('grant_type', 'authorization_code');
      params.append('client_id', this.clientId);
      params.append('redirect_uri', redirectUri);
      params.append('code_verifier', codeVerifier);

      const response = await axios.post(this.tokenURL, params.toString(), {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Authorization': `Basic ${credentials}`
        },
      });

      this.codeVerifiers.delete(state);

      return {
        success: true,
        access_token: response.data.access_token,
        refresh_token: response.data.refresh_token,
        expires_in: response.data.expires_in,
        token_type: response.data.token_type,
        scope: response.data.scope
      };
    } catch (error) {
      console.error('Twitter token exchange error:', error.response?.data || error.message);
      return {
        success: false,
        error: error.response?.data?.error_description || error.response?.data?.error || 'Token exchange failed',
        statusCode: error.response?.status,
      };
    }
  }
   // Refresh access token
   async refreshToken(refreshToken) {
    try {
      console.log('🔄 Refreshing Twitter token...');
      
      // Twitter OAuth 2.0 requires Basic authentication for token refresh
      const credentials = Buffer.from(`${this.clientId}:${this.clientSecret}`).toString('base64');
      
      const params = new URLSearchParams();
      params.append('refresh_token', refreshToken);
      params.append('grant_type', 'refresh_token');

      const response = await axios.post(this.tokenURL, params.toString(), {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Authorization': `Basic ${credentials}`
        },
      });

      console.log('✅ Twitter token refreshed successfully');

      return {
        success: true,
        access_token: response.data.access_token,
        refresh_token: response.data.refresh_token || refreshToken,
        expires_in: response.data.expires_in,
        token_type: response.data.token_type,
        scope: response.data.scope
      };
    } catch (error) {
      const statusCode = error.response?.status;
      console.error('❌ Twitter token refresh error:', {
        error: error.response?.data?.error,
        error_description: error.response?.data?.error_description,
        status: statusCode,
        message: error.message
      });
      return {
        success: false,
        error: error.response?.data?.error_description || error.response?.data?.error || 'Token refresh failed',
        statusCode,
      };
    }
  }

  // Post a single tweet with optional media
 // Enhanced postTweet method to handle different content types
async postTweet(accessToken, content, twitterContent = {}, mediaIds = []) {
  try {
    console.log('🐦 Posting to Twitter:', {
      contentLength: content?.length,
      contentPreview: content?.substring(0, 50),
      twitterContentType: twitterContent.tweet_type,
      hasPoll: !!twitterContent.poll,
      pollOptions: twitterContent.poll?.options?.length,
      hasThread: !!twitterContent.thread,
      threadLength: twitterContent.thread?.length,
      mediaCount: mediaIds?.length
    });

    let tweetData = {};
    let result = {};

    // Handle different tweet types
    if (twitterContent.tweet_type === 'poll' && twitterContent.poll) {
      console.log('📊 Posting Twitter poll:', twitterContent.poll);
      result = await this.postPoll(accessToken, content, twitterContent.poll);
      
    } else if (twitterContent.tweet_type === 'thread' && twitterContent.thread) {
      console.log('🧵 Posting Twitter thread:', twitterContent.thread);
      result = await this.postThread(accessToken, twitterContent.thread);
      
    } else {
      // Regular tweet
      console.log('🐦 Posting single tweet:', content);
      tweetData = { text: content.substring(0, 280) };

      // Add media if available
      if (mediaIds && mediaIds.length > 0) {
        tweetData.media = { media_ids: mediaIds };
      }

      const response = await axios.post(
        `${this.baseURL}/tweets`,
        tweetData,
        {
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json'
          }
        }
      );

      result = {
        success: true,
        tweet_id: response.data.data.id,
        text: response.data.data.text,
        created_at: new Date().toISOString(),
        media_count: mediaIds ? mediaIds.length : 0
      };
    }

    console.log('✅ Twitter post result:', result);
    return result;

  } catch (error) {
    console.error('❌ Twitter post error:', error.response?.data || error.message);
    return {
      success: false,
      error: error.response?.data?.detail || 'Failed to post to Twitter',
      statusCode: error.response?.status,
    };
  }
}

// Enhanced postPoll method
async postPoll(accessToken, question, poll) {
  try {
    const { options, duration_minutes } = poll;

    if (!options || options.length < 2 || options.length > 4) {
      throw new Error('Poll must have between 2 and 4 options');
    }

    if (!duration_minutes || duration_minutes < 5 || duration_minutes > 10080) {
      throw new Error('Poll duration must be between 5 minutes and 7 days');
    }

    const pollData = {
      text: question.substring(0, 280),
      poll: {
        options: options.map(option => ({ 
          label: typeof option === 'string' ? option.substring(0, 25) : option.text?.substring(0, 25) || 'Option'
        })),
        duration_minutes: duration_minutes
      }
    };

    console.log('📊 Sending poll data:', pollData);

    const response = await axios.post(
      `${this.baseURL}/tweets`,
      pollData,
      {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        }
      }
    );

    return {
      success: true,
      tweet_id: response.data.data.id,
      text: response.data.data.text,
      poll: {
        question: question,
        options: options,
        duration_minutes: duration_minutes,
        ends_at: new Date(Date.now() + duration_minutes * 60 * 1000).toISOString()
      }
    };
  } catch (error) {
    console.error('❌ Twitter poll post error:', error.response?.data || error.message);
    return {
      success: false,
      error: error.response?.data?.detail || 'Failed to post poll',
      statusCode: error.response?.status,
    };
  }
}

  // Enhanced token validation
  async validateToken(accessToken) {
    try {
      console.log('🔍 Validating Twitter token...');
      
      // First, try to get profile to validate token
      const profile = await this.getProfile(accessToken);
      if (!profile.success) {
        return {
          valid: false,
          error: profile.error || 'Token validation failed'
        };
      }

      // Try a simple test tweet to check write permissions
      const testResult = await this.postTweet(accessToken, 'Test tweet for validation - please ignore');
      
      return {
        valid: true,
        user: profile.user,
        canPost: testResult.success,
        profile: profile.user
      };
    } catch (error) {
      console.error('❌ Token validation error:', error);
      return {
        valid: false,
        error: error.message
      };
    }
  }

  // Post a thread (multiple connected tweets)
  async postThread(accessToken, threadTweets) {
    try {
      if (!Array.isArray(threadTweets) || threadTweets.length === 0) {
        return {
          success: false,
          error: 'Thread must contain at least one tweet'
        };
      }

      if (threadTweets.length > 25) {
        return {
          success: false,
          error: 'Thread cannot exceed 25 tweets'
        };
      }

      const results = [];
      let replyToId = null;

      for (let i = 0; i < threadTweets.length; i++) {
        const tweet = threadTweets[i];
        const tweetText = typeof tweet === 'string' ? tweet.substring(0, 280) : tweet.text?.substring(0, 280);
        
        const tweetData = {
          text: tweetText
        };

        // Add media to the first tweet if provided
        if (i === 0 && typeof tweet === 'object' && tweet.media_ids && tweet.media_ids.length > 0) {
          tweetData.media = {
            media_ids: tweet.media_ids
          };
        }

        // Add reply reference for subsequent tweets
        if (replyToId) {
          tweetData.reply = {
            in_reply_to_tweet_id: replyToId
          };
        }

        const response = await axios.post(
          `${this.baseURL}/tweets`,
          tweetData,
          {
            headers: {
              'Authorization': `Bearer ${accessToken}`,
              'Content-Type': 'application/json'
            }
          }
        );

        const tweetId = response.data.data.id;
        results.push({
          tweet_id: tweetId,
          text: tweetText,
          position: i + 1
        });

        replyToId = tweetId;

        // Add small delay between tweets to avoid rate limiting
        if (i < threadTweets.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      }

      return {
        success: true,
        thread_id: results[0].tweet_id, // First tweet ID as thread identifier
        tweets: results,
        total_tweets: results.length
      };
    } catch (error) {
      console.error('Twitter thread post error:', error.response?.data || error.message);
      return {
        success: false,
        error: error.response?.data?.detail || 'Failed to post thread',
        statusCode: error.response?.status,
      };
    }
  }

  async postPoll(accessToken, text, poll) {
    try {
      const { options, durationMinutes } = poll;

      if (!options || options.length < 2 || options.length > 4) {
        return {
          success: false,
          error: 'Poll must have between 2 and 4 options'
        };
      }

      if (!durationMinutes || durationMinutes < 5 || durationMinutes > 10080) {
        return {
          success: false,
          error: 'Poll duration must be between 5 minutes and 7 days (10080 minutes)'
        };
      }

      const pollData = {
        text: text.substring(0, 280),
        poll: {
          options: options.map(option => ({ label: option.substring(0, 25) })), // Max 25 chars per option
          duration_minutes: durationMinutes
        }
      };

      const response = await axios.post(
        `${this.baseURL}/tweets`,
        pollData,
        {
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json'
          }
        }
      );

      return {
        success: true,
        tweet_id: response.data.data.id,
        text: response.data.data.text,
        poll: {
          options: options,
          duration_minutes: durationMinutes,
          ends_at: new Date(Date.now() + durationMinutes * 60 * 1000).toISOString()
        }
      };
    } catch (error) {
      console.error('Twitter poll post error:', error.response?.data || error.message);
      return {
        success: false,
        error: error.response?.data?.detail || 'Failed to post poll',
        statusCode: error.response?.status,
      };
    }
  }
  // Upload media (images, GIFs, videos)
  async uploadMedia(accessToken, mediaBuffer, mimeType) {
    try {
      // Determine media type and appropriate endpoint
      const isVideo = mimeType.startsWith('video/');
      const isGif = mimeType === 'image/gif';
      
      // For videos, we need to use chunked upload
      if (isVideo) {
        return await this.uploadVideoChunked(accessToken, mediaBuffer, mimeType);
      }

      // For images and GIFs, use simple upload
      const FormData = require('form-data');
      const formData = new FormData();
      
      formData.append('media', mediaBuffer, {
        filename: `media.${mimeType.split('/')[1]}`,
        contentType: mimeType
      });

      const response = await axios.post(
        `${this.uploadURL}/media/upload.json`,
        formData,
        {
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            ...formData.getHeaders()
          }
        }
      );

      return {
        success: true,
        media_id: response.data.media_id_string,
        size: response.data.size,
        type: isGif ? 'gif' : 'image',
        image: response.data.image
      };
    } catch (error) {
      console.error('Twitter media upload error:', error.response?.data || error.message);
      return {
        success: false,
        error: error.response?.data?.errors?.[0]?.message || 'Failed to upload media',
        statusCode: error.response?.status,
      };
    }
  }

  // Upload video using chunked upload (required for videos > 5MB)
  async uploadVideoChunked(accessToken, videoBuffer, mimeType) {
    try {
      const FormData = require('form-data');
      
      // Step 1: Initialize upload
      const initFormData = new FormData();
      initFormData.append('command', 'INIT');
      initFormData.append('media_type', mimeType);
      initFormData.append('total_bytes', videoBuffer.length);

      const initResponse = await axios.post(
        `${this.uploadURL}/media/upload.json`,
        initFormData,
        {
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            ...initFormData.getHeaders()
          }
        }
      );

      const mediaId = initResponse.data.media_id_string;
      const chunkSize = 5 * 1024 * 1024; // 5MB chunks
      let segmentIndex = 0;

      // Step 2: Upload chunks
      for (let offset = 0; offset < videoBuffer.length; offset += chunkSize) {
        const chunk = videoBuffer.slice(offset, offset + chunkSize);
        
        const chunkFormData = new FormData();
        chunkFormData.append('command', 'APPEND');
        chunkFormData.append('media_id', mediaId);
        chunkFormData.append('segment_index', segmentIndex);
        chunkFormData.append('media', chunk, {
          filename: `chunk_${segmentIndex}`,
          contentType: mimeType
        });

        await axios.post(
          `${this.uploadURL}/media/upload.json`,
          chunkFormData,
          {
            headers: {
              'Authorization': `Bearer ${accessToken}`,
              ...chunkFormData.getHeaders()
            }
          }
        );

        segmentIndex++;
      }

      // Step 3: Finalize upload
      const finalizeFormData = new FormData();
      finalizeFormData.append('command', 'FINALIZE');
      finalizeFormData.append('media_id', mediaId);

      const finalizeResponse = await axios.post(
        `${this.uploadURL}/media/upload.json`,
        finalizeFormData,
        {
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            ...finalizeFormData.getHeaders()
          }
        }
      );

      return {
        success: true,
        media_id: mediaId,
        size: videoBuffer.length,
        type: 'video',
        processing_info: finalizeResponse.data.processing_info
      };
    } catch (error) {
      console.error('Twitter video upload error:', error.response?.data || error.message);
      return {
        success: false,
        error: error.response?.data?.errors?.[0]?.message || 'Failed to upload video',
        statusCode: error.response?.status,
      };
    }
  }

  // Check media processing status (for videos)
  async checkMediaStatus(accessToken, mediaId) {
    try {
      const response = await axios.get(
        `${this.uploadURL}/media/upload.json`,
        {
          params: {
            command: 'STATUS',
            media_id: mediaId
          },
          headers: {
            'Authorization': `Bearer ${accessToken}`
          }
        }
      );

      return {
        success: true,
        media_id: mediaId,
        processing_info: response.data.processing_info,
        ready: response.data.processing_info?.state === 'succeeded'
      };
    } catch (error) {
      console.error('Twitter media status check error:', error.response?.data || error.message);
      return {
        success: false,
        error: error.response?.data?.errors?.[0]?.message || 'Failed to check media status',
        statusCode: error.response?.status,
      };
    }
  }

  async getProfile(accessToken) {
    try {
      const response = await axios.get(
        `${this.baseURL}/users/me`,
        {
          params: {
            'user.fields': 'id,name,username,profile_image_url,verified,public_metrics,created_at,description,location,url,protected'
          },
          headers: {
            'Authorization': `Bearer ${accessToken}`
          }
        }
      );

      return {
        success: true,
        user: response.data.data
      };
    } catch (error) {
      console.error('Twitter user profile error:', error.response?.data || error.message);
      return {
        success: false,
        error: error.response?.data?.detail || 'Failed to get user profile',
        statusCode: error.response?.status,
      };
    }
  }
  async validateToken(accessToken) {
    try {
      const profile = await this.getProfile(accessToken);
      if (!profile.success) {
        return {
          valid: false,
          error: profile.error
        };
      }

      // Check if we can post (basic write validation)
      const testResult = await this.postTweet(accessToken, 'Test tweet for validation - will be deleted immediately');
      
      return {
        valid: true,
        user: profile.user,
        canPost: testResult.success
      };
    } catch (error) {
      return {
        valid: false,
        error: error.message
      };
    }
  }

}

module.exports = new TwitterService();