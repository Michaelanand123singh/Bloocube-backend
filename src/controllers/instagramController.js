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

      if (!code || !state) {
          return res.redirect(`${redirectToFrontend}/creator/settings?instagram=error&message=Missing+code+or+state`);
      }

      const decodedState = jwt.verify(state, config.JWT_SECRET);
      const serverCallback = `${req.protocol}://${req.get('host')}/api/instagram/callback`;
      
      // The new exchangeCodeForToken is simpler and more robust
      const tokenResult = await instagramService.exchangeCodeForToken(code, serverCallback);

      if (!tokenResult.success) {
          const detail = serializeErrorToUrl(tokenResult.error);
          return res.redirect(`${redirectToFrontend}/creator/settings?instagram=error&message=${encodeURIComponent(detail)}`);
      }

      // Update the user record in the database with all necessary info
      await User.findByIdAndUpdate(
          decodedState.userId,
          {
              $set: {
                  'socialAccounts.instagram.accessToken': tokenResult.accessToken,
                  'socialAccounts.instagram.igAccountId': tokenResult.igAccountId, // IMPORTANT: Store the Business Account ID
                  'socialAccounts.instagram.username': tokenResult.igUsername,
                  'socialAccounts.instagram.name': tokenResult.igName,
                  'socialAccounts.instagram.profileImageUrl': tokenResult.igProfileImageUrl,
                  'socialAccounts.instagram.connectedAt': new Date(),
                  // No need to store expiresAt if we're not auto-refreshing
              }
          },
          { new: true, upsert: true }
      );

      console.log("✅ Instagram user updated in DB");
      return res.redirect(`${redirectToFrontend}/creator/settings?instagram=success`);
  } catch (error) {
      console.error("🔥 Instagram callback error:", error);
      const msg = serializeErrorToUrl(error);
      return res.redirect(`${config.FRONTEND_URL}/creator/settings?instagram=error&message=${encodeURIComponent(msg)}`);
  }
}

// disconnect remains the same...
async disconnect(req, res) { /* ... */ }

// A helper function to manage API calls
async _performApiAction(req, res, action) {
  try {
      const user = await User.findById(req.user.id);
      const instagramAccount = user?.socialAccounts?.instagram;

      if (!instagramAccount?.accessToken || !instagramAccount?.igAccountId) {
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

// getProfile remains the same...
async getProfile(req, res) { /* ... */ }

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
