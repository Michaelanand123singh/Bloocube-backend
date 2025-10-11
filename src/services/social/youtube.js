// src/services/social/youtube.js
const axios = require('axios');
const crypto = require('crypto');
const config = require('../../config/env');

class YouTubeService {
  constructor() {
    this.clientId = config.YOUTUBE_CLIENT_ID;
    this.clientSecret = config.YOUTUBE_CLIENT_SECRET;
    this.baseURL = 'https://www.googleapis.com/youtube/v3';
    this.uploadURL = 'https://www.googleapis.com/upload/youtube/v3/videos'; 
    this.authURL = 'https://accounts.google.com/o/oauth2/v2/auth';
    this.tokenURL = 'https://oauth2.googleapis.com/token';
    this.codeVerifiers = new Map(); // Store code verifiers temporarily
  }


  // Generate OAuth 2.0 authorization URL with PKCE
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
      scope: 'https://www.googleapis.com/auth/youtube.readonly https://www.googleapis.com/auth/youtube.upload',
      state,
      code_challenge: codeChallenge,
      code_challenge_method: 'S256',
      access_type: 'offline',
      prompt: 'consent'
    });

    return `${this.authURL}?${params.toString()}`;
  }
  async updateVideoPrivacyStatus(accessToken, videoId, privacyStatus) {
    try {
      console.log(`📡 Updating video ${videoId} privacy status to ${privacyStatus}...`);
      const response = await axios.put(`${this.baseURL}/videos?part=status`,
        {
          id: videoId,
          status: {
            privacyStatus: privacyStatus
          }
        },
        {
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          }
        }
      );
      console.log(`✅ Video ${videoId} privacy status updated to ${response.data.status.privacyStatus}`);
      return { success: true, newPrivacyStatus: response.data.status.privacyStatus };
    } catch (error) {
      console.error('❌ YouTube video privacy update error:', error.response?.data || error.message);
      return {
        success: false,
        error: error.response?.data?.error?.message || 'Failed to update video privacy',
        statusCode: error.response?.status,
        raw: error.response?.data,
      };
    }
  }
  // Exchange authorization code for access token
  async exchangeCodeForToken(code, redirectUri, state) {
    try {
      const codeVerifier = this.codeVerifiers.get(state);
      if (!codeVerifier) {
        throw new Error('Code verifier not found for state');
      }

      const params = new URLSearchParams();
      params.append('code', code);
      params.append('grant_type', 'authorization_code');
      params.append('client_id', this.clientId);
      params.append('client_secret', this.clientSecret);
      params.append('redirect_uri', redirectUri);
      params.append('code_verifier', codeVerifier);

      const response = await axios.post(this.tokenURL, params.toString(), {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
      });

      this.codeVerifiers.delete(state);

      return {
        success: true,
        access_token: response.data.access_token,
        refresh_token: response.data.refresh_token,
        expires_in: response.data.expires_in,
        token_type: response.data.token_type,
      };
    } catch (error) {
      const statusCode = error.response?.status;
      const detail = error.response?.data || error.message;
      console.error('YouTube token exchange error:', detail);
      return {
        success: false,
        error: detail?.error_description || detail?.error || 'Token exchange failed',
        statusCode,
        raw: detail,
      };
    }
  }

  // Refresh access token
  async refreshToken(refreshToken) {
    try {
      const params = new URLSearchParams();
      params.append('refresh_token', refreshToken);
      params.append('grant_type', 'refresh_token');
      params.append('client_id', this.clientId);
      params.append('client_secret', this.clientSecret);

      const response = await axios.post(this.tokenURL, params.toString(), {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
      });

      return {
        success: true,
        access_token: response.data.access_token,
        refresh_token: response.data.refresh_token || refreshToken,
        expires_in: response.data.expires_in,
      };
    } catch (error) {
      const statusCode = error.response?.status;
      console.error('YouTube token refresh error:', error.response?.data || error.message);
      return {
        success: false,
        error: error.response?.data?.error || 'Token refresh failed',
        statusCode,
      };
    }
  }

  // Get YouTube channel info
  async getChannelInfo(accessToken) {
    try {
      console.log('🔍 YouTube API request - Channel info:', {
        hasToken: !!accessToken,
        tokenLength: accessToken?.length,
        baseURL: this.baseURL
      });

      const response = await axios.get(`${this.baseURL}/channels`, {
        params: {
          part: 'snippet,statistics',
          mine: true
        },
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'User-Agent': 'BloocubeApp/1.0',
          'Accept': 'application/json'
        },
      });

      if (response.data.items && response.data.items.length > 0) {
        const channel = response.data.items[0];
        return {
          success: true,
          channel: {
            id: channel.id,
            title: channel.snippet.title,
            description: channel.snippet.description,
            customUrl: channel.snippet.customUrl,
            thumbnails: channel.snippet.thumbnails,
            subscriberCount: channel.statistics.subscriberCount,
            videoCount: channel.statistics.videoCount,
            viewCount: channel.statistics.viewCount
          }
        };
      } else {
        return {
          success: false,
          error: 'No YouTube channel found'
        };
      }
    } catch (error) {
      const statusCode = error.response?.status;
      const errorData = error.response?.data;
      console.error('YouTube channel info error:', {
        status: statusCode,
        error: errorData,
        message: error.message
      });
      return {
        success: false,
        error: errorData?.error?.message || 'Failed to get channel info',
        statusCode,
        raw: errorData || null,
      };
    }
  }

  // Upload video to YouTube
 // In src/services/social/youtube.js

 async uploadVideo(accessToken, videoBuffer, title, description, tags = [], privacyStatus = 'private', onProgress = null) {
  try {
    console.log('🎬 Starting YouTube video upload...', {
      title,
      descriptionLength: description?.length,
      tagsCount: tags?.length,
      videoSize: videoBuffer?.length,
      privacyStatus // ✅ This should now log the value passed from the controller (e.g., 'public')
    });

    const metadata = {
      snippet: {
        title: title,
        description: description,
        tags: tags,
        categoryId: '22', // People & Blogs
      },
      status: {
        privacyStatus: privacyStatus, // ✅ FIX: Use the 'privacyStatus' parameter here
      },
    };

    // Step 1: Initialize resumable upload to get the upload URL
    const initResponse = await axios.post(
      `${this.uploadURL}?part=snippet,status&uploadType=resumable`,
      metadata,
      {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json; charset=UTF-8',
          'X-Upload-Content-Length': videoBuffer.length,
          'X-Upload-Content-Type': 'video/*', // Generic video type
        },
      }
    );

    const uploadUrl = initResponse.headers.location;
    if (!uploadUrl) {
      throw new Error('Failed to get resumable upload URL from YouTube');
    }
    console.log('📤 Upload session created:', uploadUrl);

    // Step 2: Upload the video file using the session URL
    const uploadResponse = await axios.put(uploadUrl, videoBuffer, {
      headers: {
        'Content-Length': videoBuffer.length,
        'Content-Type': 'video/'
      },
      onUploadProgress: (progressEvent) => {
        const percentCompleted = Math.round((progressEvent.loaded * 100) / progressEvent.total);
        console.log(`📊 Upload progress: ${percentCompleted}%`);
        if (onProgress) {
          onProgress(percentCompleted);
        }
      },
      validateStatus: (status) => (status >= 200 && status < 300) || status === 308,
    });

    // If the final status is 200 or 201, the upload is complete
    if (uploadResponse.status === 200 || uploadResponse.status === 201) {
      console.log('✅ Video uploaded successfully:', uploadResponse.data);
      return {
        success: true,
        video_id: uploadResponse.data.id,
        title: uploadResponse.data.snippet.title,
        description: uploadResponse.data.snippet.description,
        publishedAt: uploadResponse.data.snippet.publishedAt,
      };
    } else {
      throw new Error(`Unexpected status code ${uploadResponse.status} after upload.`);
    }

  } catch (error) {
    console.error('❌ YouTube video upload error:', {
      message: error.message,
      status: error.response?.status,
      data: error.response?.data,
    });
    return {
      success: false,
      error: error.response?.data?.error?.message || error.message || 'Failed to upload video to YouTube',
    };
  }
}

// Simple upload for small files (< 10MB)
async uploadVideoSimple(accessToken, videoBuffer, title, description, tags = [], privacyStatus = 'private') { // Ensure privacyStatus is accepted
  try {
    const formData = new FormData();

    // Create blob from buffer
    const videoBlob = new Blob([videoBuffer], { type: 'video/mp4' });
    formData.append('video', videoBlob, 'video.mp4');

    const metadata = {
      snippet: {
        title: title,
        description: description,
        tags: tags,
        categoryId: '22'
      },
      status: {
        privacyStatus: privacyStatus // ✅ FIX: Use the 'privacyStatus' parameter here
      }
    };

    formData.append('metadata', JSON.stringify(metadata));

    const response = await axios.post(
      `${this.uploadURL}?part=snippet,status&uploadType=multipart`,
      formData,
      {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          ...formData.getHeaders(),
        },
        maxBodyLength: 50 * 1024 * 1024, // 50MB
        maxContentLength: 50 * 1024 * 1024,
        timeout: 120000 // 2 minutes
      }
    );

    return {
      success: true,
      video_id: response.data.id,
      title: response.data.snippet.title,
      description: response.data.snippet.description,
      publishedAt: response.data.snippet.publishedAt
    };

  } catch (error) {
    console.error('YouTube simple upload error:', error.response?.data || error.message);
    return {
      success: false,
      error: error.response?.data?.error?.message || 'Failed to upload video',
      statusCode: error.response?.status,
    };
  }
}



  // Get video analytics
  async getVideoAnalytics(accessToken, videoId) {
    try {
      const response = await axios.get(`${this.baseURL}/videos`, {
        params: {
          part: 'statistics,snippet',
          id: videoId
        },
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });

      if (response.data.items && response.data.items.length > 0) {
        const video = response.data.items[0];
        return {
          success: true,
          analytics: {
            viewCount: video.statistics.viewCount,
            likeCount: video.statistics.likeCount,
            commentCount: video.statistics.commentCount,
            title: video.snippet.title,
            publishedAt: video.snippet.publishedAt
          }
        };
      } else {
        return {
          success: false,
          error: 'Video not found'
        };
      }
    } catch (error) {
      const statusCode = error.response?.status;
      console.error('YouTube video analytics error:', error.response?.data || error.message);
      return {
        success: false,
        error: error.response?.data?.error?.message || 'Failed to get video analytics',
        statusCode,
      };
    }
  }
}

module.exports = new YouTubeService();