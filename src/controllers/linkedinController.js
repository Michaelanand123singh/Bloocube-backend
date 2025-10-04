// src/controllers/linkedinController.js
const linkedinService = require('../services/social/linkedin');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const config = require('../config/env');

class LinkedInController {
  /**
   * Generate LinkedIn Authorization URL
   * @route POST /api/auth/linkedin
   */
  async generateAuthURL(req, res) {
    try {
      const { redirectUri } = req.body;
      
      // Validate redirect URI
      if (!redirectUri) {
        return res.status(400).json({ 
          success: false, 
          error: 'redirectUri is required' 
        });
      }

      // Get user ID from authenticated request
      // Make sure your auth middleware sets either req.userId or req.user
      const userId = req.userId || req.user?._id || req.user?.id;
      
      if (!userId) {
        return res.status(401).json({ 
          success: false, 
          error: 'User not authenticated' 
        });
      }

      // Create state with user ID for verification
      // Include redirectUri in state to retrieve it later
      const state = jwt.sign(
        { 
          userId: userId.toString(),
          redirectUri: redirectUri,
          timestamp: Date.now()
        }, 
        config.JWT_SECRET, 
        { expiresIn: '30m' }
      );

      // Generate LinkedIn authorization URL
      const authURL = linkedinService.generateAuthURL(redirectUri, state);

      res.json({ 
        success: true, 
        authURL, 
        state 
      });

    } catch (error) {
      console.error('Error generating LinkedIn auth URL:', error);
      res.status(500).json({ 
        success: false, 
        error: 'Failed to generate authorization URL',
        details: error.message 
      });
    }
  }

  /**
   * Handle LinkedIn OAuth Callback
   * @route GET /api/auth/linkedin/callback
   */
  async handleCallback(req, res) {
    // Frontend URL for redirection
    const redirectToFrontend = process.env.FRONTEND_URL || 'http://localhost:3000/creator/settings';
    
    try {
      const { code, state, error, error_description } = req.query;

      // Handle user denial or LinkedIn errors
      if (error) {
        console.log('LinkedIn OAuth error:', error, error_description);
        return res.redirect(
          `${redirectToFrontend}?linkedin=error&message=${encodeURIComponent(error_description || error)}`
        );
      }

      // Validate required parameters
      if (!code || !state) {
        return res.redirect(
          `${redirectToFrontend}?linkedin=error&message=Missing+code+or+state`
        );
      }

      // Verify and decode state
      let decoded;
      try {
        decoded = jwt.verify(state, config.JWT_SECRET);
      } catch (e) {
        console.error('Invalid state token:', e.message);
        return res.redirect(
          `${redirectToFrontend}?linkedin=error&message=Invalid+or+expired+state`
        );
      }

      // Extract redirectUri from decoded state
      const redirectUri = decoded.redirectUri || process.env.LINKEDIN_REDIRECT_URI;
      
      if (!redirectUri) {
        return res.redirect(
          `${redirectToFrontend}?linkedin=error&message=Missing+redirect+URI`
        );
      }

      console.log(`🔄 Processing LinkedIn callback for user: ${decoded.userId}`);

      // STEP 1: Exchange authorization code for access token
      const tokenResult = await linkedinService.exchangeCodeForToken(code, redirectUri);
      
      if (!tokenResult.success) {
        const detail = tokenResult.raw?.error_description || tokenResult.error;
        console.error('Token exchange failed:', detail);
        return res.redirect(
          `${redirectToFrontend}?linkedin=error&message=${encodeURIComponent(detail || 'Token+exchange+failed')}`
        );
      }

      console.log('✅ Access token obtained');

      // STEP 2: Fetch user profile from LinkedIn
      const profileResult = await linkedinService.getUserProfile(tokenResult.access_token);
      
      if (!profileResult.success) {
        const detail = profileResult.raw?.message || profileResult.error;
        console.error('Profile fetch failed:', detail);
        return res.redirect(
          `${redirectToFrontend}?linkedin=error&message=${encodeURIComponent(detail || 'Profile+fetch+failed')}`
        );
      }

      console.log('✅ Profile fetched:', profileResult.user.email);

      // STEP 3: Update user's LinkedIn account in database
      const updateData = {
        'socialAccounts.linkedin': {
          id: profileResult.user.id || profileResult.user.sub, // LinkedIn's unique ID
          email: profileResult.user.email,
          name: profileResult.user.name, // Full name from v2 API
          firstName: profileResult.user.given_name || profileResult.user.firstName,
          lastName: profileResult.user.family_name || profileResult.user.lastName,
          picture: profileResult.user.picture, // Profile picture URL
          accessToken: tokenResult.access_token,
          refreshToken: tokenResult.refresh_token, // Store if available
          expiresAt: new Date(Date.now() + (tokenResult.expires_in * 1000)),
          connectedAt: new Date(),
          isActive: true
        }
      };

      await User.findByIdAndUpdate(
        decoded.userId,
        { $set: updateData },
        { 
          new: true, // Return updated document
          runValidators: true // Run schema validators
        }
      );

      console.log('✅ LinkedIn account connected successfully');

      // STEP 4: Redirect to frontend with success
      return res.redirect(`${redirectToFrontend}?linkedin=success`);

    } catch (error) {
      console.error('❌ LinkedIn callback error:', error);
      return res.redirect(
        `${redirectToFrontend}?linkedin=error&message=${encodeURIComponent(error.message || 'Callback+failed')}`
      );
    }
  }

  /**
   * Disconnect LinkedIn Account
   * @route DELETE /api/auth/linkedin/disconnect
   */
  async disconnect(req, res) {
    try {
      const userId = req.userId || req.user?._id || req.user?.id;
      
      if (!userId) {
        return res.status(401).json({ 
          success: false, 
          error: 'User not authenticated' 
        });
      }

      // Remove LinkedIn connection
      await User.findByIdAndUpdate(
        userId,
        { 
          $unset: { 'socialAccounts.linkedin': 1 } 
        }
      );

      res.json({ 
        success: true, 
        message: 'LinkedIn account disconnected' 
      });

    } catch (error) {
      console.error('Error disconnecting LinkedIn:', error);
      res.status(500).json({ 
        success: false, 
        error: 'Failed to disconnect LinkedIn account',
        details: error.message 
      });
    }
  }

  /**
   * Get LinkedIn Connection Status
   * @route GET /api/auth/linkedin/status
   */
  async getStatus(req, res) {
    try {
      const userId = req.userId || req.user?._id || req.user?.id;
      
      if (!userId) {
        return res.status(401).json({ 
          success: false, 
          error: 'User not authenticated' 
        });
      }

      const user = await User.findById(userId).select('socialAccounts.linkedin');
      
      const linkedinAccount = user?.socialAccounts?.linkedin;
      const isConnected = !!linkedinAccount?.accessToken;
      const isExpired = linkedinAccount?.expiresAt 
        ? new Date(linkedinAccount.expiresAt) < new Date() 
        : true;

      res.json({ 
        success: true,
        connected: isConnected,
        expired: isExpired,
        account: isConnected ? {
          email: linkedinAccount.email,
          name: linkedinAccount.name,
          connectedAt: linkedinAccount.connectedAt
        } : null
      });

    } catch (error) {
      console.error('Error getting LinkedIn status:', error);
      res.status(500).json({ 
        success: false, 
        error: 'Failed to get LinkedIn status',
        details: error.message 
      });
    }
  }
}

module.exports = new LinkedInController();