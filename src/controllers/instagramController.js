const instagramService = require('../services/social/instagram');
const User = require('../models/User');
const jwt = require('jsonwebtoken');
const config = require('../config/env');
const { getCreatorSettingsUrl, buildRedirectUrl } = require('../utils/urlUtils');

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
      // Check if Instagram credentials are configured
      if (!config.FACEBOOK_APP_ID ||!config.FACEBOOK_APP_SECRET) {
        return res.status(400).json({
          success: false,
          error: 'Instagram API credentials not configured. Please set FACEBOOK_APP_ID and FACEBOOK_APP_SECRET in environment variables.'
        });
      }

      console.log('🔑 Instagram generateAuthURL called:', {
        hasUser:!!req.user,
        userId: req.userId || req.user?._id,
        redirectUri: req.body?.redirectUri,
        method: req.method
      });

      const { redirectUri } = req.body;

      // Use backend callback URL so Instagram redirects back to API
      const backendCallback = `${config.BASE_URL}/api/instagram/callback`;
      const finalRedirectUri = redirectUri || backendCallback;

      const state = jwt.sign(
        {
          userId: req.userId || req.user?._id || `guest_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          redirectUri: finalRedirectUri,
          timestamp: Date.now()
        },
        config.JWT_SECRET,
        { expiresIn: '10m' }
      );

      const authURL = instagramService.generateAuthURL(finalRedirectUri, state);

      console.log('✅ Instagram auth URL generated:', { hasAuthURL:!!authURL, state: state.substring(0, 20) + '...' });
      return res.json({ success: true, authURL, state, redirectUri: finalRedirectUri });
    } catch (error) {
      console.error('❌ Instagram generateAuthURL error:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  }

  // Handle Instagram OAuth callback
  async handleCallback(req, res) {
    // Extract frontend URL from the redirectUri in the state
    const { code, state } = req.query;
    let redirectToFrontend = getCreatorSettingsUrl();

    // Try to extract the frontend URL from the state if available
    try {
      const decoded = jwt.verify(state, config.JWT_SECRET);
      if (decoded.redirectUri) {
        // The redirectUri in state is the backend callback URL, not frontend
        // We should use the config.FRONTEND_URL instead
        console.log('🔍 Instagram state decoded, using config.FRONTEND_URL:', config.FRONTEND_URL);
        redirectToFrontend = getCreatorSettingsUrl();
      }
    } catch (e) {
      // If state is invalid, use fallback URL
      console.log('Could not decode state, using fallback frontend URL');
    }

    try {
      const { code, state, error, error_description } = req.query;

      // Handle user denial or Instagram errors
      if (error) {
        console.log('Instagram OAuth error:', error, error_description);
        return res.redirect(
          buildRedirectUrl(redirectToFrontend, { instagram: 'error', message: error_description || error })
        );
      }

      // Validate required parameters
      if (!code ||!state) {
        return res.redirect(
          buildRedirectUrl(redirectToFrontend, { instagram: 'error', message: 'Missing code or state' })
        );
      }

      // Verify and decode state
      let decoded;
      try {
        decoded = jwt.verify(state, config.JWT_SECRET);
      } catch (e) {
        console.error('Invalid state token:', e.message);
        return res.redirect(
          buildRedirectUrl(redirectToFrontend, { instagram: 'error', message: 'Invalid or expired state' })
        );
      }

      // Extract redirectUri from decoded state
      const redirectUri = decoded.redirectUri || `${config.BASE_URL}/api/instagram/callback`;

      if (!redirectUri) {
        return res.redirect(
          buildRedirectUrl(redirectToFrontend, { instagram: 'error', message: 'Missing redirect URI' })
        );
      }

      console.log(`🔄 Processing Instagram callback for user: ${decoded.userId}`);

      // Exchange code for access token
      const tokenResult = await instagramService.exchangeCodeForToken(code, redirectUri);

      if (!tokenResult.success) {
        const detail = serializeErrorToUrl(tokenResult.error);
        return res.redirect(buildRedirectUrl(redirectToFrontend, { instagram: 'error', message: detail }));
      }

      // ADDED: Calculate the token's expiration date
      const tokenExpiresAt = tokenResult.expiresIn
       ? new Date(Date.now() + tokenResult.expiresIn * 1000)
        : null;

      // Update the user record in the database with all necessary info
      await User.findByIdAndUpdate(
        decoded.userId,
        {
          $set: {
            'socialAccounts.instagram.accessToken': tokenResult.accessToken,
            // ADDED: Store the token expiration date
            'socialAccounts.instagram.tokenExpiresAt': tokenExpiresAt,
            'socialAccounts.instagram.igAccountId': tokenResult.igAccountId,
            'socialAccounts.instagram.username': tokenResult.igUsername,
            'socialAccounts.instagram.name': tokenResult.igName,
            'socialAccounts.instagram.profileImageUrl': tokenResult.igProfileImageUrl,
            'socialAccounts.instagram.connectedAt': new Date(),
            'socialAccounts.instagram.isBasicDisplay': tokenResult.isBasicDisplay || false,
            'socialAccounts.instagram.limitations': tokenResult.limitations || null,
          }
        },
        { new: true, upsert: true }
      );

      console.log("✅ Instagram user updated in DB");
      // CHANGED: Redirect with a clear success parameter for the frontend to detect
      return res.redirect(buildRedirectUrl(redirectToFrontend, { instagram_connected: 'true' }));
    } catch (error) {
      console.error("🔥 Instagram callback error:", error);
      const msg = serializeErrorToUrl(error);
      return res.redirect(buildRedirectUrl(redirectToFrontend, { instagram: 'error', message: msg }));
    }
  }

  // Disconnect Instagram account
  async disconnect(req, res) {
    try {
      const userId = req.userId || req.user?.id;
      const user = await User.findById(userId);

      if (!user) {
        return res.status(404).json({
          success: false,
          error: 'User not found'
        });
      }

      // Clear Instagram account data
      user.socialAccounts.instagram = {
        accessToken: undefined,
        tokenExpiresAt: undefined, // ADDED: Clear expiration date
        igAccountId: undefined,
        username: undefined,
        name: undefined,
        profileImageUrl: undefined,
        connectedAt: undefined,
        isBasicDisplay: undefined,
        limitations: undefined
      };

      await user.save();

      console.log('Instagram account disconnected for user:', userId);

      res.json({
        success: true,
        message: 'Instagram account disconnected successfully'
      });
    } catch (error) {
      console.error('Instagram disconnect error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to disconnect Instagram account'
      });
    }
  }

  // A helper function to manage API calls
  async _performApiAction(req, res, action) {
    try {
      const user = await User.findById(req.user.id);
      const instagramAccount = user?.socialAccounts?.instagram;

      if (!instagramAccount?.accessToken ||!instagramAccount?.igAccountId) {
        return res.status(400).json({ success: false, error: 'Instagram account not connected properly. Please reconnect.' });
      }

      // Pass both token and account ID to the action
      await action(instagramAccount.accessToken, instagramAccount.igAccountId);

    } catch (error) {
      console.error(`❌ Instagram ${action.name} error:`, error);
      res.status(500).json({ success: false, error: `Failed to perform Instagram action: ${error.message}` });
    }
  }

  // UPDATED: postContent
  async postContent(req, res) {
    await this._performApiAction(req, res, async (accessToken, igAccountId) => {
      const { type, mediaUrl, caption } = req.body;
      let result;

      if (type === "post") {
        result = await instagramService.postContent(accessToken, igAccountId, { mediaUrl, caption });
      } else {
        // Add postStory logic here if needed
        return res.status(400).json({ success: false, error: 'Invalid post type.' });
      }

      if (!result.success) {
        return res.status(400).json({ success: false, error: result.error, details: result.raw });
      }
      res.json({ success: true, message: 'Content posted successfully', data: result });
    });
  }

  // Get Instagram profile
  async getProfile(req, res) {
    try {
      const userId = req.userId || req.user?.id;
      const user = await User.findById(userId).select('socialAccounts.instagram');

      if (!user ||!user.socialAccounts?.instagram ||!user.socialAccounts.instagram.accessToken) {
        return res.json({
          success: false,
          error: 'Instagram account not connected'
        });
      }

      const instagramAccount = user.socialAccounts.instagram;

      res.json({
        success: true,
        profile: {
          id: instagramAccount.igAccountId || instagramAccount.id,
          username: instagramAccount.username,
          name: instagramAccount.name,
          profileImageUrl: instagramAccount.profileImageUrl,
          connectedAt: instagramAccount.connectedAt,
          isBasicDisplay: instagramAccount.isBasicDisplay || false,
          limitations: instagramAccount.limitations || null
        }
      });
    } catch (error) {
      console.error('Instagram profile fetch error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to fetch Instagram profile'
      });
    }
  }

  // UPDATED: getInsights
  async getInsights(req, res) {
    await this._performApiAction(req, res, async (accessToken, igAccountId) => {
      const result = await instagramService.getInsights(accessToken, igAccountId);

      if (!result.success) {
        return res.status(400).json({ success: false, error: result.error });
      }
      res.json({ success: true, insights: result.insights });
    });
  }

  // Upload Media
  async uploadMedia(req, res) {
    try {
      const userId = req.user.id;
      const user = await User.findById(userId);

      if (!user ||!user.socialAccounts?.instagram?.accessToken) {
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

  // Validate Instagram connection
  async validateConnection(req, res) {
    try {
      const userId = req.user.id;
      const user = await User.findById(userId);

      if (!user ||!user.socialAccounts?.instagram?.accessToken) {
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

  // ADDED: New method to handle token refresh
  async refreshToken(req, res) {
    try {
      const userId = req.user.id;
      const user = await User.findById(userId);
      const currentToken = user?.socialAccounts?.instagram?.accessToken;

      if (!currentToken) {
        return res.status(400).json({ success: false, error: 'No active Instagram connection found to refresh.' });
      }

      console.log(`🔄 Refreshing Instagram token for user: ${userId}`);
      const result = await instagramService.refreshToken(currentToken);

      if (!result.success) {
        return res.status(400).json({ success: false, error: result.error });
      }

      const newExpiresAt = new Date(Date.now() + result.expiresIn * 1000);

      // Update user with new token and expiry
      user.socialAccounts.instagram.accessToken = result.accessToken;
      user.socialAccounts.instagram.tokenExpiresAt = newExpiresAt;
      await user.save();

      console.log(`✅ Token refreshed successfully for user: ${userId}. New expiry: ${newExpiresAt}`);
      res.json({ success: true, message: 'Token refreshed successfully.' });

    } catch (error) {
      console.error('❌ Instagram token refresh controller error:', error);
      res.status(500).json({ success: false, error: 'Failed to refresh Instagram token.' });
    }
  }
}

module.exports = new InstagramController();