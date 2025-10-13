const axios = require('axios');
const config = require('../../config/env');

class InstagramService {
  constructor() {
    this.clientId = config.FACEBOOK_APP_ID; // Simplified: Always use Facebook App ID
    this.clientSecret = config.FACEBOOK_APP_SECRET; // Simplified: Always use Facebook App Secret
    this.baseURL = 'https://graph.facebook.com/v20.0';
    this.authURL = 'https://www.facebook.com/v20.0/dialog/oauth';
  }

  // Method to set credentials dynamically
  setCredentials(clientId, clientSecret) {
    this.clientId = clientId;
    this.clientSecret = clientSecret;
  }

  generateAuthURL(redirectUri, state) {
    const resolvedScopes = (config.INSTAGRAM_SCOPES || '').split(',')
      .map(s => s.trim())
      .filter(Boolean)
      .join(',') || 'instagram_basic,pages_show_list,instagram_content_publish';

    const params = new URLSearchParams({
      client_id: this.clientId,
      redirect_uri: redirectUri,
      scope: resolvedScopes,
      response_type: 'code',
      state,
    });

    return `${this.authURL}?${params.toString()}`;
  }

  // REWRITTEN & SIMPLIFIED: exchangeCodeForToken
  async exchangeCodeForToken(code, redirectUri) {
    try {
      console.log('🔄 Step 1: Exchanging code for a short-lived user token...');
      const tokenResponse = await axios.get(`${this.baseURL}/oauth/access_token`, {
        params: {
          client_id: this.clientId,
          client_secret: this.clientSecret,
          redirect_uri: redirectUri,
          code,
        },
      });
      const shortLivedUserToken = tokenResponse.data.access_token;

      console.log('🔄 Step 2: Exchanging for a long-lived user token...');
      const longLivedResponse = await axios.get(`${this.baseURL}/oauth/access_token`, {
        params: {
          grant_type: 'fb_exchange_token',
          client_id: this.clientId,
          client_secret: this.clientSecret,
          fb_exchange_token: shortLivedUserToken,
        },
      });
      const longLivedUserToken = longLivedResponse.data.access_token;
      
      console.log('🔄 Step 3: Fetching user pages and connected Instagram account...');
      const accountsResponse = await axios.get(`${this.baseURL}/me/accounts`, {
        params: {
          fields: 'id,name,access_token,instagram_business_account{id,username,name,profile_picture_url}',
          access_token: longLivedUserToken,
        },
      });

      const pages = accountsResponse.data.data;
      if (!pages || pages.length === 0) {
        throw new Error('No Facebook Pages found for this user.');
      }

      const connectedPage = pages.find(page => page.instagram_business_account);
      if (!connectedPage) {
        throw new Error('No Instagram Business Account found linked to your Facebook Pages.');
      }

      console.log(`✅ Found connected page: ${connectedPage.name}`);
      
      // The Page Access Token is the one we need for all future IG API calls
      return {
        success: true,
        accessToken: connectedPage.access_token, // This is the long-lived Page Access Token
        igAccountId: connectedPage.instagram_business_account.id,
        igUsername: connectedPage.instagram_business_account.username,
        igName: connectedPage.instagram_business_account.name,
        igProfileImageUrl: connectedPage.instagram_business_account.profile_picture_url,
        expiresIn: 60 * 24 * 60 * 60, // Page tokens are typically long-lived (60+ days)
      };

    } catch (error) {
      const apiError = error.response?.data?.error;
      const errorMessage = apiError?.message || error.message || 'Token exchange failed.';
      console.error('❌ Instagram token exchange error:', apiError || error);
      return { success: false, error: errorMessage, raw: apiError };
    }
  }
  
  // No refreshToken method needed. If a token is invalid, the user must reconnect.

  // UPDATED SIGNATURE: Get Instagram user profile
  async getProfile(accessToken, igAccountId) {
    try {
      const response = await axios.get(`https://graph.instagram.com/${igAccountId}`, {
        params: {
          fields: 'id,username,followers_count,media_count,name,profile_picture_url',
          access_token: accessToken,
        },
      });
      return { success: true, user: response.data };
    } catch (error) {
        const apiError = error.response?.data?.error;
        return { success: false, error: apiError?.message || 'Failed to get profile' };
    }
  }

  // UPDATED: All API methods now correctly accept igAccountId
  async postContent(accessToken, igAccountId, contentData) {
    try {
      console.log('📸 Creating media container...');
      const containerResponse = await axios.post(`${this.baseURL}/${igAccountId}/media`, {
        image_url: contentData.mediaUrl,
        caption: contentData.caption,
        access_token: accessToken,
      });
      const containerId = containerResponse.data.id;

      console.log('✅ Publishing container:', containerId);
      const publishResponse = await axios.post(`${this.baseURL}/${igAccountId}/media_publish`, {
        creation_id: containerId,
        access_token: accessToken,
      });

      return { success: true, id: publishResponse.data.id };
    } catch (error) {
      const apiError = error.response?.data?.error;
      return { success: false, error: apiError?.message || 'Failed to post content', raw: apiError };
    }
  }
  
  // Other methods (postStory, getInsights, etc.) should also use the igAccountId
  async getInsights(accessToken, igAccountId) {
    try {
      const response = await axios.get(`${this.baseURL}/${igAccountId}/insights`, {
        params: {
          metric: 'impressions,reach,profile_views',
          period: 'day',
          access_token: accessToken,
        },
      });
      return { success: true, insights: response.data.data };
    } catch (error) {
      const apiError = error.response?.data?.error;
      return { success: false, error: apiError?.message || 'Failed to get insights' };
    }
  }

  // Get user profile by username (for competitor analysis)
  async getUserProfile(username) {
    try {
      // Note: Instagram Basic Display API doesn't support username lookup for public profiles
      // This would require Instagram Graph API with proper business account setup
      // For now, return a structure that indicates the limitation
      return {
        success: false,
        error: 'Instagram profile lookup requires Instagram Graph API with business account',
        username: username,
        platform: 'instagram'
      };
    } catch (error) {
      console.error('Instagram profile fetch error:', error.response?.data || error.message);
      return {
        success: false,
        error: error.response?.data?.error?.message || 'Failed to get profile'
      };
    }
  }

  // Get user media (for competitor analysis)
  async getUserMedia(username, options = {}) {
    try {
      // Note: Instagram Basic Display API doesn't support public profile media access
      // This would require Instagram Graph API with proper business account setup
      return {
        success: false,
        error: 'Instagram media collection requires Instagram Graph API with business account',
        username: username,
        platform: 'instagram'
      };
    } catch (error) {
      console.error('Instagram media fetch error:', error.response?.data || error.message);
      return {
        success: false,
        error: error.response?.data?.error?.message || 'Failed to get media'
      };
    }
  }
}

module.exports = new InstagramService();