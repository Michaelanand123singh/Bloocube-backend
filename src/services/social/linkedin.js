// src/services/social/linkedin.js
const axios = require('axios');
const config = require('../../config/env');

class LinkedInService {
  constructor() {
    this.clientId = config.LINKEDIN_CLIENT_ID;
    this.clientSecret = config.LINKEDIN_CLIENT_SECRET;
    this.authBase = 'https://www.linkedin.com/oauth/v2';
    this.apiBase = 'https://api.linkedin.com/v2';
  }

  generateAuthURL(redirectUri, state) {
    const params = new URLSearchParams({
      response_type: 'code',
      client_id: this.clientId,
      redirect_uri: redirectUri,
      scope: config.LINKEDIN_SCOPES,
      state
    });
    return `${this.authBase}/authorization?${params.toString()}`;
  }

  async exchangeCodeForToken(code, redirectUri) {
    try {
      console.log('🔄 Exchanging LinkedIn authorization code for token...');
      console.log('Code:', code.substring(0, 10) + '...');
      console.log('Redirect URI:', redirectUri);
      console.log('Client ID:', this.clientId);
      
      const params = new URLSearchParams();
      params.append('grant_type', 'authorization_code');
      params.append('code', code);
      params.append('redirect_uri', redirectUri);
      params.append('client_id', this.clientId);
      params.append('client_secret', this.clientSecret);

      const response = await axios.post(`${this.authBase}/accessToken`, params.toString(), {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
      });

      console.log('✅ Token exchange successful');
      console.log('Token expires in:', response.data.expires_in, 'seconds');

      return {
        success: true,
        access_token: response.data.access_token,
        expires_in: response.data.expires_in,
        refresh_token: response.data.refresh_token // Store if available
      };
    } catch (error) {
      const detail = error.response?.data || error.message;
      console.error('❌ LinkedIn token exchange error:', detail);
      console.error('Status:', error.response?.status);
      console.error('Headers:', error.response?.headers);
      
      return { 
        success: false, 
        error: detail?.error_description || detail?.error || 'Token exchange failed', 
        raw: detail,
        statusCode: error.response?.status
      };
    }
  }

  // src/services/social/linkedin.js

  async getUserProfile(accessToken) {
    try {
      console.log('🔍 Fetching LinkedIn profile with OIDC endpoint...');
      
      // Use the modern OpenID Connect /userinfo endpoint
      const response = await axios.get(`${this.apiBase}/userinfo`, {
        headers: { 
          Authorization: `Bearer ${accessToken}`
        }
      });
      
      const userInfo = response.data;
      console.log('✅ Profile fetched:', userInfo);

      // Map the new fields to your application's format
      const profile = {
        id: userInfo.sub, // 'sub' is the unique ID in OIDC
        firstName: userInfo.given_name,
        lastName: userInfo.family_name,
        name: userInfo.name,
        email: userInfo.email,
        picture: userInfo.picture
      };

      console.log('✅ Profile constructed:', profile);
      return { success: true, user: profile };

    } catch (error) {
      const detail = error.response?.data || error.message;
      console.error('❌ LinkedIn profile error:', detail);
      return { 
        success: false, 
        error: detail?.message || 'Failed to get user profile', 
        raw: detail,
        statusCode: error.response?.status
      };
    }
  }

  // Post content to LinkedIn
  async post(accessToken, payload) {
    try {
      console.log('💼 Posting to LinkedIn:', {
        textLength: payload.text?.length,
        hasMedia: !!payload.media
      });

      // LinkedIn API endpoint for sharing content
      const response = await axios.post(
        'https://api.linkedin.com/v2/ugcPosts',
        {
          author: `urn:li:person:${payload.authorId}`,
          lifecycleState: 'PUBLISHED',
          specificContent: {
            'com.linkedin.ugc.ShareContent': {
              shareCommentary: {
                text: payload.text
              },
              shareMediaCategory: payload.media ? 'IMAGE' : 'NONE'
            }
          },
          visibility: {
            'com.linkedin.ugc.MemberNetworkVisibility': 'PUBLIC'
          }
        },
        {
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
            'X-Restli-Protocol-Version': '2.0.0'
          }
        }
      );

      return {
        success: true,
        post_id: response.data.id,
        text: payload.text,
        platform: 'linkedin'
      };
    } catch (error) {
      console.error('❌ LinkedIn post error:', error.response?.data || error.message);
      return {
        success: false,
        error: error.response?.data?.message || 'Failed to post to LinkedIn',
        statusCode: error.response?.status
      };
    }
  }
}

module.exports = new LinkedInService();


