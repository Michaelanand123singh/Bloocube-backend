const axios = require('axios');
const config = require('../../config/env');

class InstagramService {
  constructor() {
    this.clientId = config.FACEBOOK_APP_ID;
    this.clientSecret = config.FACEBOOK_APP_SECRET;
    this.baseURL = 'https://graph.facebook.com/v20.0';
    this.authURL = 'https://www.facebook.com/v20.0/dialog/oauth';
  }

  generateAuthURL(redirectUri, state) {
    const resolvedScopes = ((config.INSTAGRAM_SCOPES || '')
      .split(',')
      .map(s => s.trim())
      .filter(Boolean)
      .join(',')) ||
      'pages_show_list,pages_read_engagement,instagram_basic,instagram_manage_insights,instagram_content_publish,business_management';

    const params = new URLSearchParams({
      client_id: this.clientId,
      redirect_uri: redirectUri,
      scope: resolvedScopes,
      response_type: 'code',
      state,
    });

    return `${this.authURL}?${params.toString()}`;
  }

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
        throw new Error('No Facebook Pages found for this user. Please create a Facebook Page and connect it to your Instagram Business account to use Instagram integration.');
      }

      const connectedPage = pages.find(page => page.instagram_business_account);
      
      // REMOVED: The incorrect fallback to the Basic Display API has been removed.
      // The Graph API flow requires a Professional (Business/Creator) account linked to a Facebook Page.
      if (!connectedPage) {
        throw new Error('No Instagram Business Account found linked to your Facebook Pages. Please convert your Instagram account to a Business or Creator account and connect it to a Facebook Page to use the full integration features.');
      }

      console.log(`✅ Found connected page: ${connectedPage.name}`);

      // The Page Access Token is the one we need for all future IG API calls.
      // We also need to get its expiration time to store it.
      const debugTokenResponse = await axios.get(`${this.baseURL}/debug_token`, {
        params: {
          input_token: connectedPage.access_token,
          access_token: `${this.clientId}|${this.clientSecret}` // App Access Token
        }
      });

      const expiresIn = debugTokenResponse.data.data.expires_at? 
        (debugTokenResponse.data.data.expires_at - Math.floor(Date.now() / 1000)) : 
        (60 * 60 * 24 * 60); // Default to 60 days if not present

      return {
        success: true,
        // IMPORTANT: This is the long-lived Page Access Token, required for API calls.
        accessToken: connectedPage.access_token,
        igAccountId: connectedPage.instagram_business_account.id,
        igUsername: connectedPage.instagram_business_account.username,
        igName: connectedPage.instagram_business_account.name,
        igProfileImageUrl: connectedPage.instagram_business_account.profile_picture_url,
        expiresIn: expiresIn, // CHANGED: Return expires_in seconds
        isBasicDisplay: false
      };

    } catch (error) {
      const apiError = error.response?.data?.error;
      const errorMessage = apiError?.message || error.message || 'Token exchange failed.';
      console.error('❌ Instagram token exchange error:', apiError || error);
      return { success: false, error: errorMessage, raw: apiError };
    }
  }

  // ADDED: New method to refresh a long-lived access token [1]
  async refreshToken(accessToken) {
    try {
      console.log('🔄 Refreshing long-lived Instagram token...');
      // NOTE: The refresh endpoint is on graph.instagram.com, not graph.facebook.com
      const response = await axios.get('https://graph.instagram.com/refresh_access_token', {
        params: {
          grant_type: 'ig_refresh_token',
          access_token: accessToken,
        },
      });

      const { access_token: newAccessToken, expires_in: expiresIn } = response.data;
      console.log('✅ Token refreshed successfully.');

      return {
        success: true,
        accessToken: newAccessToken,
        expiresIn: expiresIn,
      };
    } catch (error) {
      const apiError = error.response?.data?.error;
      const errorMessage = apiError?.message || 'Token refresh failed.';
      console.error('❌ Instagram token refresh error:', apiError || error);
      return { success: false, error: errorMessage, raw: apiError };
    }
  }

  async getProfile(accessToken, igAccountId) {
    try {
      // NOTE: Profile endpoint is on graph.facebook.com when using Page-backed tokens
      const response = await axios.get(`${this.baseURL}/${igAccountId}`, {
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

  async postContent(accessToken, igAccountId, contentData) {
    try {
      console.log('📸 Instagram posting details:', {
        igAccountId,
        hasAccessToken:!!accessToken,
        mediaUrl: contentData.mediaUrl,
        caption: contentData.caption?.substring(0, 50) + '...'
      });

      const validation = await this.validateInstagramAccount(accessToken, igAccountId);
      if (!validation.valid) {
        return { success: false, error: validation.error, raw: validation.raw };
      }

      console.log('📸 Creating media container...');
      const containerResponse = await axios.post(`${this.baseURL}/${igAccountId}/media`, {
        image_url: contentData.mediaUrl,
        caption: contentData.caption,
        access_token: accessToken,
      });

      if (!containerResponse.data?.id) {
        return { success: false, error: 'Failed to create media container', raw: containerResponse.data };
      }

      const containerId = containerResponse.data.id;
      console.log('✅ Media container created:', containerId);

      console.log('📸 Publishing container...');
      const publishResponse = await axios.post(`${this.baseURL}/${igAccountId}/media_publish`, {
        creation_id: containerId,
        access_token: accessToken,
      });

      if (!publishResponse.data?.id) {
        return { success: false, error: 'Failed to publish media', raw: publishResponse.data };
      }

      console.log('✅ Instagram post published:', publishResponse.data.id);
      return { success: true, id: publishResponse.data.id };
    } catch (error) {
      const apiError = error.response?.data?.error;
      console.error('❌ Instagram posting error:', {
        message: apiError?.message || error.message,
        code: apiError?.code,
        type: apiError?.type,
        fbtrace_id: apiError?.fbtrace_id
      });

      return {
        success: false,
        error: apiError?.message || 'Failed to post content',
        raw: apiError,
        errorCode: apiError?.code,
        errorType: apiError?.type
      };
    }
  }

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

  async validateToken(accessToken) {
    try {
      const response = await axios.get(`${this.baseURL}/me`, {
        params: {
          fields: 'id,name',
          access_token: accessToken,
        },
      });

      return {
        valid: true,
        user: response.data,
        canPost: true
      };
    } catch (error) {
      const apiError = error.response?.data?.error;
      console.error('Instagram token validation error:', apiError || error.message);

      return {
        valid: false,
        error: apiError?.message || 'Invalid or expired token',
        canPost: false
      };
    }
  }

  async validateInstagramAccount(accessToken, igAccountId) {
    try {
      console.log('🔍 Validating Instagram account:', { igAccountId, hasToken:!!accessToken });

      const accountResponse = await axios.get(`${this.baseURL}/${igAccountId}`, {
        params: {
          fields: 'id,username,name,profile_picture_url,account_type,media_count',
          access_token: accessToken,
        },
      });

      console.log('✅ Instagram account validated:', {
        id: accountResponse.data.id,
        username: accountResponse.data.username,
        accountType: accountResponse.data.account_type
      });

      if (accountResponse.data.account_type!== 'BUSINESS' && accountResponse.data.account_type!== 'CREATOR') {
        return {
          valid: false,
          error: 'Instagram account must be a Business or Creator account to post content.',
          raw: { accountType: accountResponse.data.account_type }
        };
      }

      return {
        valid: true,
        account: accountResponse.data,
        canPost: true
      };

    } catch (accountError) {
      const apiError = accountError.response?.data?.error;
      console.error('❌ Instagram account validation failed:', apiError || accountError.message);

      if (apiError?.code === 100 && apiError?.error_subcode === 33) {
        return {
          valid: false,
          error: 'Instagram account not found or access denied. Please reconnect your Instagram Business account.',
          raw: apiError
        };
      }

      return {
        valid: false,
        error: apiError?.message || 'Failed to validate Instagram account',
        raw: apiError
      };
    }
  }
}

module.exports = new InstagramService();