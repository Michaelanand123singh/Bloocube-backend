// src/services/social/instagram.js
const axios = require('axios');
const crypto = require('crypto');
const config = require('../../config/env');

class InstagramService {
  constructor() {
    this.clientId = config.INSTAGRAM_CLIENT_ID;
    this.clientSecret = config.INSTAGRAM_CLIENT_SECRET;
    this.baseURL = 'https://graph.instagram.com';
    this.authURL = 'https://api.instagram.com/oauth/authorize';
    this.tokenURL = 'https://api.instagram.com/oauth/access_token';
    this.longLivedTokenURL = 'https://graph.instagram.com/access_token';
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
      client_id: this.clientId,
      redirect_uri: redirectUri,
      scope: config.INSTAGRAM_SCOPES || 'user_profile,user_media',
      response_type: 'code',
      state,
    });

    return `${this.authURL}?${params.toString()}`;
  }

  async exchangeCodeForToken(code, redirectUri, state) {
    try {
      console.log('🔄 Exchanging Instagram code for token...');
      
      // Step 1: Exchange code for short-lived access token
      const shortTokenResponse = await axios.post(this.tokenURL, {
        client_id: this.clientId,
        client_secret: this.clientSecret,
        grant_type: 'authorization_code',
        redirect_uri: redirectUri,
        code: code
      }, {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        }
      });

      const shortToken = shortTokenResponse.data.access_token;
      console.log('✅ Short-lived token obtained');

      // Step 2: Exchange short-lived token for long-lived token
      const longTokenResponse = await axios.get(this.longLivedTokenURL, {
        params: {
          grant_type: 'ig_exchange_token',
          client_secret: this.clientSecret,
          access_token: shortToken
        }
      });

      console.log('✅ Long-lived token obtained');

      return {
        success: true,
        access_token: longTokenResponse.data.access_token,
        expires_in: longTokenResponse.data.expires_in,
        token_type: 'bearer'
      };
    } catch (error) {
      console.error('Instagram token exchange error:', error.response?.data || error.message);
      return {
        success: false,
        error: error.response?.data?.error_message || error.response?.data?.error || 'Token exchange failed',
        statusCode: error.response?.status,
        raw: error.response?.data
      };
    }
  }

  // Refresh long-lived access token
  async refreshToken(accessToken) {
    try {
      console.log('🔄 Refreshing Instagram token...');
      
      const response = await axios.get(this.longLivedTokenURL, {
        params: {
          grant_type: 'ig_refresh_token',
          access_token: accessToken
        }
      });

      console.log('✅ Instagram token refreshed successfully');

      return {
        success: true,
        access_token: response.data.access_token,
        expires_in: response.data.expires_in,
        token_type: 'bearer'
      };
    } catch (error) {
      console.error('❌ Instagram token refresh error:', error.response?.data || error.message);
      return {
        success: false,
        error: error.response?.data?.error_message || error.response?.data?.error || 'Token refresh failed',
        statusCode: error.response?.status,
      };
    }
  }

  // Get Instagram user profile
  async getProfile(accessToken) {
    try {
      console.log('👤 Fetching Instagram profile...');
      
      const response = await axios.get(`${this.baseURL}/me`, {
        params: {
          fields: 'id,username,account_type,media_count',
          access_token: accessToken
        }
      });

      return {
        success: true,
        user: {
          id: response.data.id,
          username: response.data.username,
          name: response.data.username, // Instagram doesn't provide display name in basic profile
          account_type: response.data.account_type,
          media_count: response.data.media_count
        }
      };
    } catch (error) {
      console.error('Instagram profile error:', error.response?.data || error.message);
      return {
        success: false,
        error: error.response?.data?.error_message || error.response?.data?.error || 'Failed to get profile',
        statusCode: error.response?.status,
      };
    }
  }

  // Validate access token
  async validateToken(accessToken) {
    try {
      console.log('🔍 Validating Instagram token...');
      
      // Test token by getting user info
      const profile = await this.getProfile(accessToken);
      if (!profile.success) {
        return {
          valid: false,
          error: profile.error || 'Token validation failed'
        };
      }

      // For Instagram, we can't easily test posting without actually posting
      // So we'll just validate that we can read the profile
      return {
        valid: true,
        user: profile.user,
        canPost: true // Assume can post if token is valid
      };
    } catch (error) {
      console.error('❌ Token validation error:', error);
      return {
        valid: false,
        error: error.message
      };
    }
  }

  // Post content to Instagram
  async postContent(accessToken, contentData) {
    try {
      console.log('📸 Posting to Instagram:', {
        hasCaption: !!contentData.caption,
        hasMediaUrl: !!contentData.mediaUrl,
        hasLocation: !!contentData.location
      });

      // First, create a media container
      const containerData = {
        image_url: contentData.mediaUrl,
        caption: contentData.caption || '',
        access_token: accessToken
      };

      // Add location if provided
      if (contentData.location) {
        containerData.location_id = contentData.location;
      }

      const containerResponse = await axios.post(
        `${this.baseURL}/${await this.getUserId(accessToken)}/media`,
        containerData
      );

      const containerId = containerResponse.data.id;
      console.log('✅ Media container created:', containerId);

      // Then publish the media
      const publishResponse = await axios.post(
        `${this.baseURL}/${await this.getUserId(accessToken)}/media_publish`,
        {
          creation_id: containerId,
          access_token: accessToken
        }
      );

      return {
        success: true,
        id: publishResponse.data.id,
        permalink: `https://instagram.com/p/${publishResponse.data.id}`,
        created_at: new Date().toISOString()
      };
    } catch (error) {
      console.error('❌ Instagram post error:', error.response?.data || error.message);
      return {
        success: false,
        error: error.response?.data?.error_message || error.response?.data?.error || 'Failed to post to Instagram',
        statusCode: error.response?.status,
        raw: error.response?.data
      };
    }
  }

  // Post story to Instagram
  async postStory(accessToken, storyData) {
    try {
      console.log('📱 Posting Instagram story...');

      // Create story container
      const containerData = {
        image_url: storyData.mediaUrl,
        access_token: accessToken
      };

      const containerResponse = await axios.post(
        `${this.baseURL}/${await this.getUserId(accessToken)}/media`,
        containerData
      );

      const containerId = containerResponse.data.id;
      console.log('✅ Story container created:', containerId);

      // Publish the story
      const publishResponse = await axios.post(
        `${this.baseURL}/${await this.getUserId(accessToken)}/media_publish`,
        {
          creation_id: containerId,
          access_token: accessToken
        }
      );

      return {
        success: true,
        id: publishResponse.data.id,
        created_at: new Date().toISOString()
      };
    } catch (error) {
      console.error('❌ Instagram story error:', error.response?.data || error.message);
      return {
        success: false,
        error: error.response?.data?.error_message || error.response?.data?.error || 'Failed to post story',
        statusCode: error.response?.status,
        raw: error.response?.data
      };
    }
  }

  // Upload media to Instagram
  async uploadMedia(accessToken, mediaBuffer, mimeType) {
    try {
      console.log('📤 Uploading media to Instagram...');

      // For Instagram, we typically need to upload to a hosting service first
      // This is a simplified version - in production, you'd upload to AWS S3 or similar
      const FormData = require('form-data');
      const formData = new FormData();
      
      formData.append('file', mediaBuffer, {
        filename: `media.${mimeType.split('/')[1]}`,
        contentType: mimeType
      });

      // This would typically upload to your own hosting service
      // For now, we'll return a placeholder URL
      const mediaUrl = `https://your-cdn.com/uploads/${Date.now()}.${mimeType.split('/')[1]}`;
      
      return {
        success: true,
        media_id: `media_${Date.now()}`,
        media_url: mediaUrl,
        type: mimeType.startsWith('video/') ? 'video' : 'image'
      };
    } catch (error) {
      console.error('Instagram media upload error:', error.response?.data || error.message);
      return {
        success: false,
        error: error.response?.data?.error_message || 'Failed to upload media',
        statusCode: error.response?.status,
      };
    }
  }

  // Get Instagram insights
  async getInsights(accessToken) {
    try {
      console.log('📊 Fetching Instagram insights...');

      const userId = await this.getUserId(accessToken);
      
      // Get account insights
      const insightsResponse = await axios.get(
        `${this.baseURL}/${userId}/insights`,
        {
          params: {
            metric: 'impressions,reach,profile_views,website_clicks',
            period: 'day',
            access_token: accessToken
          }
        }
      );

      return {
        success: true,
        insights: insightsResponse.data.data
      };
    } catch (error) {
      console.error('Instagram insights error:', error.response?.data || error.message);
      return {
        success: false,
        error: error.response?.data?.error_message || error.response?.data?.error || 'Failed to get insights',
        statusCode: error.response?.status,
      };
    }
  }

  // Helper method to get user ID
  async getUserId(accessToken) {
    try {
      const response = await axios.get(`${this.baseURL}/me`, {
        params: {
          fields: 'id',
          access_token: accessToken
        }
      });
      return response.data.id;
    } catch (error) {
      throw new Error('Failed to get user ID');
    }
  }

  // Get media list
  async getMedia(accessToken, limit = 25) {
    try {
      console.log('📷 Fetching Instagram media...');

      const userId = await this.getUserId(accessToken);
      
      const response = await axios.get(
        `${this.baseURL}/${userId}/media`,
        {
          params: {
            fields: 'id,caption,media_type,media_url,thumbnail_url,permalink,timestamp',
            limit: limit,
            access_token: accessToken
          }
        }
      );

      return {
        success: true,
        media: response.data.data
      };
    } catch (error) {
      console.error('Instagram media fetch error:', error.response?.data || error.message);
      return {
        success: false,
        error: error.response?.data?.error_message || error.response?.data?.error || 'Failed to get media',
        statusCode: error.response?.status,
      };
    }
  }
}

module.exports = new InstagramService();