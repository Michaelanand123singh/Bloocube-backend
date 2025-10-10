const instagramService = require('../services/social/instagram');
const User = require('../models/User');
const jwt = require('jsonwebtoken');
const config = require('../config/env');

// Helper function to serialize any variable into a string for URL query parameters
const serializeErrorToUrl = (err) => {
  if (typeof err === 'string') return err;
  if (err instanceof Error) return err.message;
  if (err && typeof err === 'object') {
    // Safely stringify objects, including those passed back from the service layer
    return JSON.stringify(err);
  }
  return 'An unknown error occurred';
};

class InstagramController {
  // Generate Instagram OAuth URL
  async generateAuthURL(req, res) {
    try {
      console.log('🔑 Instagram generateAuthURL called:', {
        hasUser: !!req.user,
        userId: req.userId || req.user?._id,
        redirectUri: req.body?.redirectUri || req.query?.redirectUri,
        method: req.method
      });

      const redirectUri = req.body?.redirectUri || req.query?.redirectUri;
      const state = jwt.sign(
        { userId: req.userId || req.user._id },
        config.JWT_SECRET,
        { expiresIn: '30m' }
      );

      const authURL = instagramService.generateAuthURL(redirectUri, state);

      console.log('✅ Instagram auth URL generated:', { hasAuthURL: !!authURL, state: state.substring(0, 20) + '...' });
      return res.json({ success: true, authURL, state, redirectUri });
    } catch (error) {
      console.error('❌ Instagram generateAuthURL error:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  }

  // Handle Instagram OAuth callback
  async handleCallback(req, res) {
    try {
      const { code, state } = req.query;
      const redirectToFrontend = config.FRONTEND_URL || 'http://localhost:3000';

      console.log("📥 Instagram Callback query params:", { code, state });

      if (!code || !state) {
        const msg = 'Missing code or state';
        return res.redirect(`${redirectToFrontend}/creator/settings?instagram=error&message=${encodeURIComponent(msg)}`);
      }

      // Verify state
      let decodedState;
      try {
        decodedState = jwt.verify(state, config.JWT_SECRET);
        console.log("✅ Decoded state:", decodedState);
      } catch (error) {
        console.error("❌ Invalid state:", error);
        const msg = 'Invalid state: ' + serializeErrorToUrl(error);
        return res.redirect(`${redirectToFrontend}/creator/settings?instagram=error&message=${encodeURIComponent(msg)}`);
      }

      // Compute backend callback URL (must match the one used during authorization)
      const serverCallback = `${req.protocol}://${req.get('host')}/api/instagram/callback`;

      // Exchange code for token
      console.log("🔄 Exchanging code for token with redirectUri:", serverCallback);
      const tokenResult = await instagramService.exchangeCodeForToken(code, serverCallback, state);
      console.log("🔑 Instagram token result:", tokenResult);

      if (!tokenResult.success) {
        // Use the robust serialization helper here
        const detail = serializeErrorToUrl(tokenResult.error) || 'Token exchange failed';
        return res.redirect(`${redirectToFrontend}/creator/settings?instagram=error&message=${encodeURIComponent(String(detail))}`);
      }

      // Fetch Instagram profile
      let profileResult;
      try {
        profileResult = await instagramService.getProfile(tokenResult.access_token);
        console.log("👤 Instagram profile result:", profileResult);
      } catch (e) {
        console.log("👤 Instagram profile fetch threw:", e);
      }

      // Update DB
      await User.findByIdAndUpdate(
        decodedState.userId,
        {
          $set: {
            'socialAccounts.instagram.accessToken': tokenResult.access_token,
            'socialAccounts.instagram.refreshToken': tokenResult.refresh_token,
            'socialAccounts.instagram.expiresAt': new Date(Date.now() + tokenResult.expires_in * 1000),
            'socialAccounts.instagram.connectedAt': new Date(),
            ...(profileResult?.success && {
              'socialAccounts.instagram.id': profileResult.user.id,
              'socialAccounts.instagram.username': profileResult.user.username,
              'socialAccounts.instagram.name': profileResult.user.name,
              'socialAccounts.instagram.profileImageUrl': profileResult.user.profile_image_url
            })
          }
        },
        { upsert: true }
      );

      console.log("✅ Instagram user updated in DB");

      return res.redirect(`${redirectToFrontend}/creator/settings?instagram=success`);
    } catch (error) {
      console.error("🔥 Instagram callback error:", error);
      const redirectToFrontend = config.FRONTEND_URL || 'http://localhost:3000';
      // Use the robust serialization helper here
      const msg = serializeErrorToUrl(error) || 'Callback failed';
      return res.redirect(`${redirectToFrontend}/creator/settings?instagram=error&message=${encodeURIComponent(String(msg))}`);
    }
  }

  // Disconnect Instagram account
  async disconnect(req, res) {
    try {
      const userId = req.user.id;

      const user = await User.findByIdAndUpdate(
        userId,
        {
          $unset: { 'socialAccounts.instagram': 1 }
        },
        { new: true }
      );

      if (!user) {
        return res.status(404).json({ success: false, error: 'User not found' });
      }

      res.json({ success: true, message: 'Instagram account disconnected successfully' });
    } catch (error) {
      console.error('Instagram disconnect error:', error);
      res.status(500).json({ success: false, error: 'Failed to disconnect Instagram account' });
    }
  }

  // Post content to Instagram
  async postContent(req, res) {
    try {
      const { type, content, mediaUrl, caption, location } = req.body;
      const userId = req.user.id;
      
      console.log('📝 Instagram post request:', {
        userId,
        type,
        contentLength: content?.length,
        contentPreview: content?.substring(0, 50),
        hasMediaUrl: !!mediaUrl,
        hasCaption: !!caption,
        hasLocation: !!location
      });

      const user = await User.findById(userId);
      
      if (!user || !user.socialAccounts?.instagram?.accessToken) {
        console.log('❌ Instagram account not connected for user:', userId);
        return res.status(400).json({ 
          success: false, 
          error: 'Instagram account not connected. Please connect your Instagram account first.' 
        });
      }

      // Check if token is expired and refresh if needed
      let accessToken = user.socialAccounts.instagram.accessToken;
      const tokenExpiresAt = new Date(user.socialAccounts.instagram.expiresAt);
      const now = new Date();
      
      console.log('🔑 Token status:', {
        expiresAt: tokenExpiresAt,
        now: now,
        isExpired: tokenExpiresAt < now,
        tokenPreview: accessToken ? `${accessToken.substring(0, 10)}...` : 'No token'
      });

      if (tokenExpiresAt < now) {
        console.log('🔄 Instagram token expired, refreshing...');
        const refreshResult = await instagramService.refreshToken(user.socialAccounts.instagram.refreshToken);
        
        if (refreshResult.success) {
          accessToken = refreshResult.access_token;
          // Update user with new token
          await User.findByIdAndUpdate(userId, {
            $set: {
              'socialAccounts.instagram.accessToken': refreshResult.access_token,
              'socialAccounts.instagram.refreshToken': refreshResult.refresh_token,
              'socialAccounts.instagram.expiresAt': new Date(Date.now() + refreshResult.expires_in * 1000)
            }
          });
          console.log('✅ Instagram token refreshed successfully');
        } else {
          console.log('❌ Failed to refresh Instagram token:', refreshResult.error);
          return res.status(400).json({
            success: false,
            error: 'Failed to refresh Instagram token. Please reconnect your Instagram account.'
          });
        }
      }

      // Validate token can post
      console.log('🔍 Validating Instagram token permissions...');
      const validation = await instagramService.validateToken(accessToken);
      if (!validation.valid || !validation.canPost) {
        console.log('❌ Instagram token validation failed:', validation.error);
        return res.status(400).json({
          success: false,
          error: validation.error || 'Instagram account cannot post. Please check permissions.'
        });
      }
      console.log('✅ Instagram token validation passed');

      let result;

      // Handle different post types
      if (type === "post") {
        // Single Instagram post
        console.log('📸 Posting single Instagram post...');
        result = await instagramService.postContent(accessToken, {
          caption: caption || content,
          mediaUrl: mediaUrl,
          location: location
        });

      } else if (type === "story") {
        // Instagram story
        console.log('📱 Posting Instagram story...');
        result = await instagramService.postStory(accessToken, {
          mediaUrl: mediaUrl,
          caption: caption || content
        });

      } else {
        return res.status(400).json({ 
          success: false, 
          error: 'Invalid post type. Use "post" or "story"' 
        });
      }

      console.log('📊 Instagram API result:', result);

      if (!result.success) {
        return res.status(400).json({ 
          success: false, 
          error: result.error,
          details: result.raw 
        });
      }

      res.json({ 
        success: true, 
        message: 'Instagram content posted successfully', 
        data: result,
        post_url: result.permalink || `https://instagram.com/p/${result.id}`
      });
      
    } catch (error) {
      console.error('❌ Instagram post error:', error);
      res.status(500).json({ 
        success: false, 
        error: 'Failed to post content to Instagram',
        details: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  }

  // Upload Media
  async uploadMedia(req, res) {
    try {
      const userId = req.user.id;
      const user = await User.findById(userId);

      if (!user || !user.socialAccounts?.instagram?.accessToken) {
        return res.status(400).json({ success: false, error: 'Instagram account not connected' });
      }

      if (!req.file) {
        return res.status(400).json({ success: false, error: 'No media file provided' });
      }

      const result = await instagramService.uploadMedia(user.socialAccounts.instagram.accessToken, req.file.buffer, req.file.mimetype);

      if (!result.success) {
        return res.status(400).json({ success: false, error: result.error });
      }

      res.json({ success: true, mediaId: result.media_id, mediaUrl: result.media_url });
    } catch (error) {
      console.error('Instagram media upload error:', error);
      res.status(500).json({ success: false, error: 'Failed to upload media' });
    }
  }

  // Get Instagram profile
  async getProfile(req, res) {
    try {
      const userId = req.user.id;
      const user = await User.findById(userId);

      if (!user || !user.socialAccounts?.instagram) {
        return res.status(400).json({ success: false, error: 'Instagram account not connected' });
      }

      res.json({ success: true, profile: user.socialAccounts.instagram });
    } catch (error) {
      console.error('Instagram profile error:', error);
      res.status(500).json({ success: false, error: 'Failed to get Instagram profile' });
    }
  }

  // Validate Instagram connection
  async validateConnection(req, res) {
    try {
      const userId = req.user.id;
      const user = await User.findById(userId);

      if (!user || !user.socialAccounts?.instagram?.accessToken) {
        return res.status(400).json({ success: false, error: 'Instagram account not connected' });
      }

      const validation = await instagramService.validateToken(user.socialAccounts.instagram.accessToken);

      if (!validation.valid) {
        return res.status(400).json({ success: false, error: validation.error });
      }

      res.json({ 
        success: true, 
        valid: true, 
        user: validation.user,
        canPost: validation.canPost
      });
    } catch (error) {
      console.error('Instagram validation error:', error);
      res.status(500).json({ success: false, error: 'Failed to validate Instagram connection' });
    }
  }

  // Get Instagram insights
  async getInsights(req, res) {
    try {
      const userId = req.user.id;
      const user = await User.findById(userId);

      if (!user || !user.socialAccounts?.instagram?.accessToken) {
        return res.status(400).json({ success: false, error: 'Instagram account not connected' });
      }

      // Check if token is expired and refresh if needed
      let accessToken = user.socialAccounts.instagram.accessToken;
      if (user.socialAccounts.instagram.expiresAt < new Date()) {
        const refreshResult = await instagramService.refreshToken(user.socialAccounts.instagram.refreshToken);
        if (refreshResult.success) {
          accessToken = refreshResult.access_token;
          await User.findByIdAndUpdate(userId, {
            $set: {
              'socialAccounts.instagram.accessToken': refreshResult.access_token,
              'socialAccounts.instagram.refreshToken': refreshResult.refresh_token,
              'socialAccounts.instagram.expiresAt': new Date(Date.now() + refreshResult.expires_in * 1000)
            }
          });
        } else {
          return res.status(400).json({
            success: false,
            error: 'Failed to refresh Instagram token'
          });
        }
      }

      const result = await instagramService.getInsights(accessToken);

      if (!result.success) {
        return res.status(400).json({ success: false, error: result.error });
      }

      res.json({ success: true, insights: result.insights });
    } catch (error) {
      console.error('Instagram insights error:', error);
      res.status(500).json({ success: false, error: 'Failed to get Instagram insights' });
    }
  }
}

module.exports = new InstagramController();
