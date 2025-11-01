// src/services/social/linkedin.js
const axios = require('axios');
const config = require('../../config/env');
const fs = require('fs');

class LinkedInService {
  constructor() {
    this.clientId = config.LINKEDIN_CLIENT_ID;
    this.clientSecret = config.LINKEDIN_CLIENT_SECRET;
    this.authBase = 'https://www.linkedin.com/oauth/v2';
    this.apiBase = 'https://api.linkedin.com/v2';
  }

  // Method to set credentials dynamically
  setCredentials(clientId, clientSecret) {
    this.clientId = clientId;
    this.clientSecret = clientSecret;
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

  // Refresh access token using refresh token
  async refreshToken(refreshToken) {
    try {
      console.log('🔄 Refreshing LinkedIn token...');
      
      if (!refreshToken) {
        console.error('❌ No refresh token provided');
        return { 
          success: false, 
          error: 'Refresh token is required' 
        };
      }

      const params = new URLSearchParams();
      params.append('grant_type', 'refresh_token');
      params.append('refresh_token', refreshToken);
      params.append('client_id', this.clientId);
      params.append('client_secret', this.clientSecret);

      const response = await axios.post(`${this.authBase}/accessToken`, params.toString(), {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
      });

      console.log('✅ LinkedIn token refreshed successfully');
      console.log('Token expires in:', response.data.expires_in, 'seconds');

      return {
        success: true,
        access_token: response.data.access_token,
        refresh_token: response.data.refresh_token || refreshToken, // Use existing if not provided
        expires_in: response.data.expires_in
      };
    } catch (error) {
      const detail = error.response?.data || error.message;
      console.error('❌ LinkedIn token refresh error:', detail);
      console.error('Status:', error.response?.status);
      
      return { 
        success: false, 
        error: detail?.error_description || detail?.error || 'Token refresh failed', 
        raw: detail,
        statusCode: error.response?.status
      };
    }
  }

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

  // ✅ NEW: Step 1 - Register the upload (image/video)
  async registerUpload(accessToken, authorId, isVideo = false) {
    try {
      const response = await axios.post(
        `${this.apiBase}/assets?action=registerUpload`,
        {
          registerUploadRequest: {
            recipes: [isVideo ? 'urn:li:digitalmediaRecipe:feedshare-video' : 'urn:li:digitalmediaRecipe:feedshare-image'],
            owner: authorId,
            serviceRelationships: [
              {
                relationshipType: 'OWNER',
                identifier: 'urn:li:userGeneratedContent',
              },
            ],
          },
        },
        {
          headers: { Authorization: `Bearer ${accessToken}` },
        }
      );
      const uploadUrl = response.data.value.uploadMechanism['com.linkedin.digitalmedia.uploading.MediaUploadHttpRequest'].uploadUrl;
      const assetUrn = response.data.value.asset;
      return { success: true, uploadUrl, assetUrn };
    } catch (error) {
      console.error('❌ LinkedIn Register Upload Error:', error.response?.data);
      return { success: false, error: 'Failed to register upload' };
    }
  }

  // ✅ NEW: Step 2 - Upload the image binary
  async uploadImage(uploadUrl, imageBuffer) {
    try {
      await axios.put(uploadUrl, imageBuffer, {
        headers: { 'Content-Type': 'application/octet-stream' },
      });
      return { success: true };
    } catch (error) {
      console.error('❌ LinkedIn Image Upload Error:', error.response?.data);
      return { success: false, error: 'Failed to upload image binary' };
    }
  }

  // ✅ NEW: Upload the video binary (same PUT flow)
  async uploadVideo(uploadUrl, videoBuffer) {
    try {
      await axios.put(uploadUrl, videoBuffer, {
        headers: { 'Content-Type': 'application/octet-stream' },
      });
      return { success: true };
    } catch (error) {
      console.error('❌ LinkedIn Video Upload Error:', error.response?.data);
      return { success: false, error: 'Failed to upload video binary' };
    }
  }

  // ✅ UPDATED: The main post creation function
  async post(accessToken, payload) {
    try {
      console.log('💼 Posting to LinkedIn:', {
        textLength: payload.text?.length,
        hasMedia: !!payload.media,
      });

      let mediaAssetUrn = null;

      // --- Media Upload Flow ---
      if (payload.media && payload.media.buffer) {
        const isVideo = typeof payload.media.type === 'string' && payload.media.type.toLowerCase().startsWith('video');
        // 1. Register the upload
        const registerResult = await this.registerUpload(accessToken, payload.authorId, isVideo);
        if (!registerResult.success) {
          throw new Error('LinkedIn upload registration failed.');
        }

        // 2. Upload the binary
        const uploadResult = isVideo
          ? await this.uploadVideo(registerResult.uploadUrl, payload.media.buffer)
          : await this.uploadImage(registerResult.uploadUrl, payload.media.buffer);
        if (!uploadResult.success) {
          throw new Error(isVideo ? 'LinkedIn video binary upload failed.' : 'LinkedIn image binary upload failed.');
        }

        mediaAssetUrn = registerResult.assetUrn; // Save the asset URN for the post
        console.log(`✅ LinkedIn media uploaded successfully: ${mediaAssetUrn}`);
      }
      // --- End Media Upload Flow ---

      const postBody = {
        author: payload.authorId,
        lifecycleState: 'PUBLISHED',
        specificContent: {
          'com.linkedin.ugc.ShareContent': {
            shareCommentary: {
              text: payload.text,
            },
            shareMediaCategory: mediaAssetUrn ? ((payload.media && String(payload.media.type || '').toLowerCase().startsWith('video')) ? 'VIDEO' : 'IMAGE') : 'NONE',
            ...(mediaAssetUrn && {
              media: [
                {
                  status: 'READY',
                  media: mediaAssetUrn,
                },
              ],
            }),
          },
        },
        visibility: {
          'com.linkedin.ugc.MemberNetworkVisibility': 'PUBLIC',
        },
      };

      const response = await axios.post(`${this.apiBase}/ugcPosts`, postBody, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'X-Restli-Protocol-Version': '2.0.0',
        },
      });

      return {
        success: true,
        post_id: response.data.id,
      };
    } catch (error) {
      console.error('❌ LinkedIn post error:', error.response?.data || error.message);
      return {
        success: false,
        error: error.response?.data?.message || 'Failed to post to LinkedIn',
      };
    }
  }

  // Get user profile by username (for competitor analysis)
  async getUserProfilebyusernme(username) {
    try {
      // LinkedIn API requires user ID, not username
      // This is a simplified version - in reality, you'd need proper authentication
      return {
        success: false,
        error: 'LinkedIn profile lookup requires proper API authentication and user ID',
        username: username,
        platform: 'linkedin'
      };
    } catch (error) {
      console.error('LinkedIn profile fetch error:', error.response?.data || error.message);
      return {
        success: false,
        error: error.response?.data?.error?.message || 'Failed to get profile'
      };
    }
  }

  // Get user posts (for competitor analysis)
  async getUserPosts(username, options = {}) {
    try {
      // LinkedIn API requires user ID and proper authentication
      // This is a simplified version
      return {
        success: false,
        error: 'LinkedIn posts collection requires proper API authentication and user ID',
        username: username,
        platform: 'linkedin'
      };
    } catch (error) {
      console.error('LinkedIn posts fetch error:', error.response?.data || error.message);
      return {
        success: false,
        error: error.response?.data?.error?.message || 'Failed to get posts'
      };
    }
  }
}

module.exports = new LinkedInService();


