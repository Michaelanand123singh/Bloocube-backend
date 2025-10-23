// src/services/social/youtube.js
const axios = require('axios');
const crypto = require('crypto');
const config = require('../../config/env');

class YouTubeService {
  constructor() {
    this.clientId = config.YOUTUBE_CLIENT_ID;
    this.clientSecret = config.YOUTUBE_CLIENT_SECRET;
    this.apiKey = config.YOUTUBE_API_KEY;
    this.baseURL = 'https://www.googleapis.com/youtube/v3';
    this.uploadURL = 'https://www.googleapis.com/upload/youtube/v3/videos'; 
    this.authURL = 'https://accounts.google.com/o/oauth2/v2/auth';
    this.tokenURL = 'https://oauth2.googleapis.com/token';
    this.codeVerifiers = new Map(); // Store code verifiers temporarily
    
    console.log('YouTube service initialized:', { 
      hasClientId: !!this.clientId, 
      hasClientSecret: !!this.clientSecret,
      hasApiKey: !!this.apiKey,
      apiKeyPreview: this.apiKey ? `${this.apiKey.substring(0, 10)}...` : 'none'
    });
  }

  // Method to set credentials dynamically
  setCredentials(clientId, clientSecret, apiKey = null) {
    this.clientId = clientId;
    this.clientSecret = clientSecret;
    if (apiKey) {
      this.apiKey = apiKey;
    }
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

 async uploadVideo(accessToken, videoBuffer, title, description, tags = [], privacyStatus = 'private', onProgress = null, thumbnailBuffer = null, category = 'Entertainment', isShort = false, videoPath = null) {
  try {
    console.log('🎬 Starting YouTube video upload...', {
      title,
      descriptionLength: description?.length,
      tagsCount: tags?.length,
      videoSize: videoBuffer?.length,
      privacyStatus,
      hasThumbnail: !!thumbnailBuffer,
      category,
      isShort,
      videoPath,
      madeForKids: true // ✅ COPPA compliance
    });

    // Import video analysis utility
    const VideoAnalysis = require('../../utils/videoAnalysis');
    
    // Analyze video if path is provided
    let videoAnalysis = null;
    if (videoPath) {
      try {
        videoAnalysis = await VideoAnalysis.analyzeVideo(videoPath);
        console.log('📊 Video analysis completed:', videoAnalysis);
        
        // Override isShort based on actual video analysis
        if (videoAnalysis.isYouTubeShort) {
          isShort = true;
          console.log('🎬 Video detected as YouTube Short based on analysis');
        }
      } catch (analysisError) {
        console.warn('⚠️ Video analysis failed, using provided parameters:', analysisError.message);
      }
    }

    // Get category ID
    const categoryId = VideoAnalysis.getYouTubeCategoryId(category);
    
    // Adjust title and description for Shorts
    let finalTitle = title;
    let finalDescription = description;
    
    if (isShort || (videoAnalysis && videoAnalysis.isYouTubeShort)) {
      finalTitle = VideoAnalysis.generateShortsTitle(title, videoAnalysis || { isYouTubeShort: true });
      finalDescription = VideoAnalysis.generateShortsDescription(description, videoAnalysis || { isYouTubeShort: true });
      console.log('🎬 Adjusted content for YouTube Shorts');
    }

    // Add category and tags prompts to description
    finalDescription = this.enhanceDescriptionWithPrompts(finalDescription, category, tags, isShort);

    console.log('👶 Setting video as Made for Kids for COPPA compliance');

    const metadata = {
      snippet: {
        title: finalTitle,
        description: finalDescription,
        tags: tags,
        categoryId: categoryId,
      },
      status: {
        privacyStatus: privacyStatus,
        selfDeclaredMadeForKids: true, // ✅ COPPA compliance - set to Made for Kids
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
        'Content-Type': 'video/mp4' // ✅ FIX: Proper Content-Type header
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
      const videoId = uploadResponse.data.id;
      
      // Upload thumbnail if provided
      let thumbnailResult = null;
      if (thumbnailBuffer) {
        try {
          console.log('🖼️ Uploading custom thumbnail...');
          thumbnailResult = await this.uploadThumbnail(accessToken, videoId, thumbnailBuffer);
          if (thumbnailResult.success) {
            console.log('✅ Thumbnail uploaded successfully');
          } else {
            console.warn('⚠️ Thumbnail upload failed:', thumbnailResult.message);
          }
        } catch (thumbnailError) {
          console.warn('⚠️ Thumbnail upload failed:', thumbnailError.message);
          // Don't fail the entire upload if thumbnail fails
        }
      }
      
      return {
        success: true,
        video_id: videoId,
        title: uploadResponse.data.snippet.title,
        description: uploadResponse.data.snippet.description,
        publishedAt: uploadResponse.data.snippet.publishedAt,
        thumbnail: thumbnailResult ? {
          success: thumbnailResult.success,
          url: thumbnailResult.thumbnailUrl,
          message: thumbnailResult.message
        } : null
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
async uploadVideoSimple(accessToken, videoBuffer, title, description, tags = [], privacyStatus = 'private', thumbnailBuffer = null, category = 'Entertainment', isShort = false) { // Ensure privacyStatus is accepted
  try {
    // Import video analysis utility
    const VideoAnalysis = require('../../utils/videoAnalysis');
    
    const formData = new FormData();

    // Create blob from buffer
    const videoBlob = new Blob([videoBuffer], { type: 'video/mp4' });
    formData.append('video', videoBlob, 'video.mp4');

    // Enhance description with prompts
    const enhancedDescription = this.enhanceDescriptionWithPrompts(description, category, tags, isShort);

    console.log('👶 Setting video as Made for Kids for COPPA compliance (Simple Upload)');

    const metadata = {
      snippet: {
        title: title,
        description: enhancedDescription,
        tags: tags,
        categoryId: VideoAnalysis.getYouTubeCategoryId(category)
      },
      status: {
        privacyStatus: privacyStatus, // ✅ FIX: Use the 'privacyStatus' parameter here
        selfDeclaredMadeForKids: true, // ✅ COPPA compliance - set to Made for Kids
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

    const videoId = response.data.id;
    
    // Upload thumbnail if provided
    if (thumbnailBuffer) {
      try {
        console.log('🖼️ Uploading custom thumbnail...');
        await this.uploadThumbnail(accessToken, videoId, thumbnailBuffer);
        console.log('✅ Thumbnail uploaded successfully');
      } catch (thumbnailError) {
        console.warn('⚠️ Thumbnail upload failed:', thumbnailError.message);
        // Don't fail the entire upload if thumbnail fails
      }
    }

    return {
      success: true,
      video_id: videoId,
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

  // Upload custom thumbnail for a video
  async uploadThumbnail(accessToken, videoId, thumbnailBuffer) {
    try {
      console.log('🖼️ Uploading thumbnail for video:', videoId, 'Size:', thumbnailBuffer.length);
      
      // Determine content type based on buffer header
      let contentType = 'image/jpeg'; // Default to JPEG
      if (thumbnailBuffer[0] === 0x89 && thumbnailBuffer[1] === 0x50) {
        contentType = 'image/png';
      } else if (thumbnailBuffer[0] === 0xFF && thumbnailBuffer[1] === 0xD8) {
        contentType = 'image/jpeg';
      } else if (thumbnailBuffer[0] === 0x47 && thumbnailBuffer[1] === 0x49) {
        contentType = 'image/gif';
      }
      
      console.log('🖼️ Detected thumbnail format:', contentType);
      
      // Add delay to ensure video is fully processed
      console.log('⏳ Waiting 5 seconds for video processing...');
      await new Promise(resolve => setTimeout(resolve, 5000));
      
      // Use the correct YouTube Data API v3 thumbnails.set endpoint
      const response = await axios.post(
        `https://www.googleapis.com/upload/youtube/v3/thumbnails/set`,
        thumbnailBuffer,
        {
          params: {
            videoId: videoId,
            uploadType: 'media'
          },
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': contentType,
            'Content-Length': thumbnailBuffer.length
          },
          maxContentLength: 2 * 1024 * 1024, // 2MB max for thumbnails
        }
      );

      console.log('✅ Thumbnail uploaded successfully:', response.data);
      return {
        success: true,
        thumbnailUrl: response.data.items?.[0]?.default?.url || response.data.thumbnailUrl
      };
      
    } catch (error) {
      console.error('❌ Thumbnail upload error:', {
        message: error.message,
        status: error.response?.status,
        data: error.response?.data,
      });
      
      // Don't fail the entire upload if thumbnail fails
      return {
        success: false,
        message: error.response?.data?.error?.message || 'Failed to upload thumbnail',
        thumbnailUrl: null
      };
    }
  }

  // Enhance description with category and tags prompts
  enhanceDescriptionWithPrompts(description, category, tags, isShort = false) {
    try {
      console.log('📝 Enhancing description with prompts:', { category, tagsCount: tags?.length, isShort });
      
      let enhancedDescription = description || '';
      
      // Add category prompt
      if (category && category !== 'Entertainment') {
        const categoryPrompt = `\n\n📂 Category: ${category}`;
        if (!enhancedDescription.includes('Category:')) {
          enhancedDescription += categoryPrompt;
        }
      }
      
      // Add tags prompt
      if (tags && tags.length > 0) {
        const tagsList = tags.join(', ');
        const tagsPrompt = `\n\n🏷️ Tags: ${tagsList}`;
        if (!enhancedDescription.includes('Tags:')) {
          enhancedDescription += tagsPrompt;
        }
      }
      
      // Add content type prompt
      if (isShort) {
        const shortsPrompt = `\n\n🎬 Content Type: YouTube Short`;
        if (!enhancedDescription.includes('Content Type:')) {
          enhancedDescription += shortsPrompt;
        }
      } else {
        const videoPrompt = `\n\n🎬 Content Type: YouTube Video`;
        if (!enhancedDescription.includes('Content Type:')) {
          enhancedDescription += videoPrompt;
        }
      }
      
      // Add engagement prompts
      const engagementPrompts = [
        '\n\n💬 What do you think about this content?',
        '\n\n👍 Like if you enjoyed this video!',
        '\n\n🔔 Subscribe for more content like this!'
      ];
      
      // Only add engagement prompts if description is not too long
      if (enhancedDescription.length < 4000) {
        enhancedDescription += engagementPrompts.join('');
      }
      
      console.log('✅ Description enhanced successfully');
      return enhancedDescription;
      
    } catch (error) {
      console.error('❌ Error enhancing description:', error.message);
      return description || ''; // Return original description if enhancement fails
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

  // Get channel by username/handle (for competitor analysis)
  async getChannelByUsername(username) {
    try {
      if (!this.apiKey) {
        throw new Error('YouTube API key not configured');
      }

      console.log('Searching for YouTube channel:', { username, apiKey: this.apiKey ? 'configured' : 'missing' });

      // First try to search for the channel by custom URL or handle
      const searchResponse = await axios.get(`${this.baseURL}/search`, {
        params: {
          part: 'snippet',
          q: username,
          type: 'channel',
          maxResults: 1,
          key: this.apiKey
        }
      });

      console.log('YouTube search response:', { 
        itemsFound: searchResponse.data.items?.length || 0,
        searchTerm: username 
      });

      if (searchResponse.data.items && searchResponse.data.items.length > 0) {
        const channelId = searchResponse.data.items[0].id.channelId;
        
        // Now get the full channel details
        const channelResponse = await axios.get(`${this.baseURL}/channels`, {
          params: {
            part: 'snippet,statistics,contentDetails,brandingSettings',
            id: channelId,
            key: this.apiKey
          }
        });

        if (channelResponse.data.items && channelResponse.data.items.length > 0) {
          return channelResponse.data.items[0];
        }
      }

      // Fallback: try the old forUsername method (deprecated but might still work for some channels)
      try {
        const response = await axios.get(`${this.baseURL}/channels`, {
          params: {
            part: 'snippet,statistics,contentDetails,brandingSettings',
            forUsername: username,
            key: this.apiKey
          }
        });

        if (response.data.items && response.data.items.length > 0) {
          return response.data.items[0];
        }
      } catch (fallbackError) {
        // Ignore fallback error, we'll throw the main error
      }

      throw new Error('Channel not found');
    } catch (error) {
      console.error('YouTube channel fetch error:', error.response?.data || error.message);
      throw new Error(error.response?.data?.error?.message || 'Failed to get channel');
    }
  }

  // Get channel by ID (for competitor analysis)
  async getChannelById(channelId) {
    try {
      if (!this.apiKey) {
        throw new Error('YouTube API key not configured');
      }

      const response = await axios.get(`${this.baseURL}/channels`, {
        params: {
          part: 'snippet,statistics,contentDetails,brandingSettings',
          id: channelId,
          key: this.apiKey
        }
      });

      if (response.data.items && response.data.items.length > 0) {
        return response.data.items[0];
      } else {
        throw new Error('Channel not found');
      }
    } catch (error) {
      console.error('YouTube channel fetch error:', error.response?.data || error.message);
      throw new Error(error.response?.data?.error?.message || 'Failed to get channel');
    }
  }

  // Get channel videos (for competitor analysis)
  async getChannelVideos(channelId, options = {}) {
    try {
      if (!this.apiKey) {
        throw new Error('YouTube API key not configured');
      }

      console.log('Fetching YouTube videos for channel:', { channelId, maxResults: options.maxResults || 10 });

      // First, get the list of videos
      const searchResponse = await axios.get(`${this.baseURL}/search`, {
        params: {
          part: 'snippet',
          channelId: channelId,
          type: 'video',
          order: 'date',
          maxResults: options.maxResults || 10,
          key: this.apiKey
        }
      });

      const videos = searchResponse.data.items || [];
      console.log('Found YouTube videos:', { count: videos.length });

      if (videos.length === 0) {
        return [];
      }

      // Get video IDs for detailed statistics
      const videoIds = videos.map(video => video.id.videoId).join(',');
      
      // Fetch detailed video statistics
      const detailsResponse = await axios.get(`${this.baseURL}/videos`, {
        params: {
          part: 'snippet,statistics,contentDetails',
          id: videoIds,
          key: this.apiKey
        }
      });

      const videoDetails = detailsResponse.data.items || [];
      console.log('Fetched video details:', { count: videoDetails.length });

      // Combine search results with detailed statistics
      const enrichedVideos = videos.map(video => {
        const details = videoDetails.find(detail => detail.id === video.id.videoId);
        return {
          id: video.id.videoId,
          title: video.snippet.title,
          description: video.snippet.description,
          publishedAt: video.snippet.publishedAt,
          thumbnails: video.snippet.thumbnails,
          channelId: video.snippet.channelId,
          channelTitle: video.snippet.channelTitle,
          // Add engagement metrics
          viewCount: parseInt(details?.statistics?.viewCount) || 0,
          likeCount: parseInt(details?.statistics?.likeCount) || 0,
          commentCount: parseInt(details?.statistics?.commentCount) || 0,
          duration: details?.contentDetails?.duration,
          // Map to common format
          likes: parseInt(details?.statistics?.likeCount) || 0,
          comments: parseInt(details?.statistics?.commentCount) || 0,
          views: parseInt(details?.statistics?.viewCount) || 0,
          created_time: video.snippet.publishedAt,
          created_at: video.snippet.publishedAt
        };
      });

      return enrichedVideos;
    } catch (error) {
      console.error('YouTube videos fetch error:', error.response?.data || error.message);
      throw new Error(error.response?.data?.error?.message || 'Failed to get channel videos');
    }
  }
}

module.exports = new YouTubeService();