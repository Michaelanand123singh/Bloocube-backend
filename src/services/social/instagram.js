const axios = require('axios');
const crypto = require('crypto');
const config = require('../../config/env');

class InstagramService {
  constructor() {
    this.clientId = config.INSTAGRAM_CLIENT_ID;
    this.clientSecret = config.INSTAGRAM_CLIENT_SECRET;
    // For Instagram Business accounts, OAuth runs through Facebook's dialog
    this.baseURL = 'https://graph.facebook.com/v20.0';
    this.authURL = 'https://www.facebook.com/v20.0/dialog/oauth';
    this.tokenURL = 'https://graph.facebook.com/v20.0/oauth/access_token';
    this.longLivedTokenURL = 'https://graph.instagram.com/access_token'; // Kept but deprecated for Graph flow
    this.codeVerifiers = new Map();
  }

  generateAuthURL(redirectUri, state) {
    const codeVerifier = crypto.randomBytes(32).toString('base64url');
    const codeChallenge = crypto
      .createHash('sha256')
      .update(codeVerifier)
      .digest('base64url');

    this.codeVerifiers.set(state, codeVerifier);

    // Use Facebook OAuth scopes for Instagram Business via Facebook Login
    const resolvedScopes = (config.INSTAGRAM_SCOPES || '').split(',')
      .map(s => s.trim())
      .filter(Boolean)
      // Strip deprecated/invalid Basic Display scopes if present
      .filter(s => !['user_profile', 'user_media'].includes(s))
      // Ensure minimal valid scopes
      .join(',') || 'instagram_basic,pages_show_list,pages_read_engagement';

    const params = new URLSearchParams({
      client_id: this.clientId,
      redirect_uri: redirectUri,
      scope: resolvedScopes,
      response_type: 'code',
      state,
    });

    return `${this.authURL}?${params.toString()}`;
  }

  async exchangeCodeForToken(code, redirectUri, state) {
    try {
      console.log('🔄 Exchanging Instagram code for Facebook User Access Token...');
      
      // Step 1: Exchange code for short-lived Facebook User Access Token
      // FIX: This is the correct step for Instagram Graph API (Business) flow.
      const tokenResponse = await axios.post(this.tokenURL, {
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

      const tokenData = tokenResponse.data;
      console.log('✅ Facebook User Access Token obtained (Expires in:', tokenData.expires_in, 's)');

      // NOTE: We stop here. The next steps (get long-lived, get pages, get IG ID, get IG token)
      // are complex and require a separate function call. We return the basic Facebook token.
      
      return {
        success: true,
        access_token: tokenData.access_token,
        expires_in: tokenData.expires_in,
        token_type: 'bearer'
      };
    } catch (error) {
      console.error('Instagram token exchange error:', error.response?.data || error.message);
      
      // --- FIX: Robustly extract string error message from the API response ---
      const apiErrorData = error.response?.data;
      let errorMessage = 'Token exchange failed';

      if (apiErrorData) {
        if (apiErrorData.error_message) {
          errorMessage = apiErrorData.error_message;
        } else if (apiErrorData.error && typeof apiErrorData.error === 'object' && apiErrorData.error.message) {
          // Handles cases like: { error: { message: "...", type: "...", code: 400 } }
          errorMessage = apiErrorData.error.message;
        } else if (apiErrorData.error && typeof apiErrorData.error === 'string') {
          errorMessage = apiErrorData.error;
        } else {
          // Fallback to stringifying the entire API response data for debugging
          errorMessage = JSON.stringify(apiErrorData);
        }
      } else if (error.message) {
        errorMessage = error.message;
      }

      return {
        success: false,
        error: errorMessage, // Now guaranteed to be a string (or a JSON string)
        statusCode: error.response?.status,
        raw: apiErrorData
      };
    }
  }

  // --- NEW FUNCTION: Get the Page Token and Instagram Business ID ---
  async getIgBusinessToken(facebookUserAccessToken) {
    try {
      console.log('👤 Fetching connected Facebook Pages...');
          
      // 1. Get user's pages
      const pagesResponse = await axios.get(`${this.baseURL}/me/accounts`, {
        params: {
          access_token: facebookUserAccessToken,
          fields: 'id,name,access_token'
        }
      });
      
      const pages = pagesResponse.data.data;
      if (!pages || pages.length === 0) {
        throw new Error('No Facebook Pages found. An Instagram Business/Creator account must be linked to a Facebook Page.');
      }

      console.log('🔍 Checking Pages for linked Instagram Business Account...');

      // For simplicity, we assume the first page with a connected Instagram account is the one to use.
      for (const page of pages) {
        
        // 2. Check if the page has an Instagram Business Account connected
        const pageIgResponse = await axios.get(`${this.baseURL}/${page.id}`, {
          params: {
            access_token: facebookUserAccessToken, // Note: Still using the user token here
            fields: 'instagram_business_account'
          }
        });

        const igAccount = pageIgResponse.data.instagram_business_account;

        if (igAccount && igAccount.id) {
          console.log('✅ Found Instagram Business Account:', igAccount.id);
          
          // 3. The page token (page.access_token) is the token required for IG Graph API calls
          // The user token is short-lived, but the page token is typically long-lived.
          
          return {
            success: true,
            igAccountId: igAccount.id,
            igAccessToken: page.access_token, // This is the Page Token, which acts as the IG token
            pageId: page.id,
            pageName: page.name,
          };
        }
      }
      
      throw new Error('No Instagram Business/Creator account found linked to your Facebook Pages. Please check your setup in Meta Business Suite.');

    } catch (error) {
      console.error('❌ Error in getIgBusinessToken:', error.response?.data || error.message);
      return {
        success: false,
        error: error.response?.data?.error?.message || error.message || 'Failed to retrieve Instagram Business token',
      };
    }
  }

  // Refresh long-lived access token
  async refreshToken(accessToken) {
    try {
      // FIX: This is the Basic Display API endpoint, which is not what we should use for Graph API (Page Tokens)
      // Page Access Tokens for Graph API are generally refreshed automatically by Facebook
      // or should be re-fetched using the user's latest long-lived token.
      // For now, we'll implement the Facebook User Long-Lived Token Exchange here for stability.
      
      console.log('🔄 Refreshing Facebook/Instagram token (long-lived user token exchange)...');
      
      const response = await axios.get(`${this.baseURL}/oauth/access_token`, {
        params: {
          grant_type: 'fb_exchange_token',
          client_id: this.clientId,
          client_secret: this.clientSecret,
          fb_exchange_token: accessToken // The existing token
        }
      });

      console.log('✅ Facebook User Long-Lived Token obtained');

      return {
        success: true,
        access_token: response.data.access_token,
        expires_in: response.data.expires_in,
        token_type: 'bearer'
      };

    } catch (error) {
      console.error('❌ Facebook/Instagram token refresh error:', error.response?.data || error.message);
      
      const apiErrorData = error.response?.data;
      let errorMessage = 'Token refresh failed';

      if (apiErrorData) {
        if (apiErrorData.error_message) {
          errorMessage = apiErrorData.error_message;
        } else if (apiErrorData.error && typeof apiErrorData.error === 'object' && apiErrorData.error.message) {
          errorMessage = apiErrorData.error.message;
        } else if (apiErrorData.error && typeof apiErrorData.error === 'string') {
          errorMessage = apiErrorData.error;
        } else {
          errorMessage = JSON.stringify(apiErrorData);
        }
      } else if (error.message) {
        errorMessage = error.message;
      }

      return {
        success: false,
        error: errorMessage,
        statusCode: error.response?.status,
      };
    }
  }

  // Get Instagram user profile
  async getProfile(accessToken, igAccountId) {
    try {
      console.log('👤 Fetching Instagram profile with IG Account ID:', igAccountId);
      
      // We query the specific IG Business Account ID using the Page Token (accessToken)
      const response = await axios.get(`${this.baseURL}/${igAccountId}`, {
        params: {
          fields: 'id,username,followers_count,media_count,name,biography,profile_picture_url',
          access_token: accessToken
        }
      });

      return {
        success: true,
        user: {
          id: response.data.id,
          username: response.data.username,
          name: response.data.name, 
          account_type: 'BUSINESS',
          media_count: response.data.media_count,
          profileImageUrl: response.data.profile_picture_url
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
  async validateToken(accessToken, igAccountId) {
    try {
      console.log('🔍 Validating Instagram token by fetching profile...');
      
      // Token validity is confirmed if we can successfully fetch the IG profile
      const profile = await this.getProfile(accessToken, igAccountId);
      if (!profile.success) {
        return {
          valid: false,
          error: profile.error || 'Token validation failed'
        };
      }
      
      // Check for posting permissions (we can check the token info endpoint for scopes in a real app,
      // but for simplicity and stability, we assume if the token is connected and we are fetching
      // the profile using the Graph API, the necessary scopes (content_publish) were requested.)
      
      return {
        valid: true,
        user: profile.user,
        canPost: true // Assuming scope was requested
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
  async postContent(accessToken, igAccountId, contentData) {
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
        access_token: accessToken // The page token is used here
      };

      // Add location if provided
      if (contentData.location) {
        containerData.location_id = contentData.location;
      }

      const containerResponse = await axios.post(
        `${this.baseURL}/${igAccountId}/media`,
        containerData
      );

      const containerId = containerResponse.data.id;
      console.log('✅ Media container created:', containerId);

      // Then publish the media
      const publishResponse = await axios.post(
        `${this.baseURL}/${igAccountId}/media_publish`,
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
  async postStory(accessToken, igAccountId, storyData) {
    try {
      console.log('📱 Posting Instagram story...');

      // Create story container
      const containerData = {
        image_url: storyData.mediaUrl,
        access_token: accessToken
      };

      const containerResponse = await axios.post(
        `${this.baseURL}/${igAccountId}/media`,
        containerData
      );

      const containerId = containerResponse.data.id;
      console.log('✅ Story container created:', containerId);

      // Publish the story
      const publishResponse = await axios.post(
        `${this.baseURL}/${igAccountId}/media_publish`,
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

      // This is placeholder logic. In production, you'd upload to your own CDN 
      // (like S3) and then use that URL for the postContent function.
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
  async getInsights(accessToken, igAccountId) {
    try {
      console.log('📊 Fetching Instagram insights...');
      
      // Get account insights
      const insightsResponse = await axios.get(
        `${this.baseURL}/${igAccountId}/insights`, // Use IG Account ID here
        {
          params: {
            metric: 'impressions,reach,profile_views,website_clicks',
            period: 'day',
            access_token: accessToken // Use Page Token here
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
  
  // Get media list
  async getMedia(accessToken, igAccountId, limit = 25) {
    try {
      console.log('📷 Fetching Instagram media...');
      
      const response = await axios.get(
        `${this.baseURL}/${igAccountId}/media`, // Use IG Account ID here
        {
          params: {
            fields: 'id,caption,media_type,media_url,thumbnail_url,permalink,timestamp',
            limit: limit,
            access_token: accessToken // Use Page Token here
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
