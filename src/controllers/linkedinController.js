// src/controllers/linkedinController.js
const linkedinService = require('../services/social/linkedin');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const config = require('../config/env');
const { getCreatorSettingsUrl, buildRedirectUrl } = require('../utils/urlUtils');

class LinkedInController {
  /**
   * Generate LinkedIn Authorization URL
   * @route POST /api/auth/linkedin
   */
  async generateAuthURL(req, res) {
    try {
      // Check if LinkedIn credentials are configured
      if (!config.LINKEDIN_CLIENT_ID || !config.LINKEDIN_CLIENT_SECRET) {
        return res.status(400).json({ 
          success: false, 
          error: 'LinkedIn API credentials not configured. Please set LINKEDIN_CLIENT_ID and LINKEDIN_CLIENT_SECRET in environment variables.' 
        });
      }

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
      console.log('🔑 Generating LinkedIn state token...');
      console.log('User ID:', userId);
      console.log('Redirect URI:', redirectUri);
      console.log('JWT Secret exists:', !!config.JWT_SECRET);
      
      const state = jwt.sign(
        { 
          userId: userId.toString(),
          redirectUri: redirectUri,
          timestamp: Date.now()
        }, 
        config.JWT_SECRET, 
        { 
          expiresIn: '30m',
          issuer: 'bloocube-api',
          audience: 'bloocube-client'
        }
      );
      
      console.log('✅ State token generated successfully');
      console.log('State token (first 50 chars):', state.substring(0, 50) + '...');

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
  async saveConnection(req, res) {
    try {
      const userId = req.userId; // From your 'authenticate' middleware
      const linkedInData = req.body;

      // Update user's LinkedIn account in database
      const updateData = {
        'socialAccounts.linkedin': {
          id: linkedInData.id,
          email: linkedInData.email,
          firstName: linkedInData.firstName,
          lastName: linkedInData.lastName,
          name: `${linkedInData.firstName} ${linkedInData.lastName}`.trim(),
          accessToken: linkedInData.accessToken,
          refreshToken: linkedInData.refreshToken,
          expiresAt: linkedInData.expiresAt,
          connectedAt: linkedInData.connectedAt,
          isActive: true
        }
      };

      await User.findByIdAndUpdate(userId, { $set: updateData }, { new: true });

      console.log(`✅ LinkedIn account saved for user: ${userId}`);
      res.json({ success: true, message: 'LinkedIn connection saved.' });

    } catch (error) {
      console.error('❌ Error in saveConnection:', error);
      res.status(500).json({ success: false, error: 'Failed to save connection' });
    }
  }
  /**
   * Handle LinkedIn OAuth Callback
   * @route GET /api/auth/linkedin/callback
   */
  async handleCallback(req, res) {
    // Use consistent frontend URL from config
    const { code, state } = req.query;
    const redirectToFrontend = getCreatorSettingsUrl();
    
    try {
      const { code, state, error, error_description } = req.query;

      // Handle user denial or LinkedIn errors
      if (error) {
        console.log('LinkedIn OAuth error:', error, error_description);
        return res.redirect(
          buildRedirectUrl(redirectToFrontend, { linkedin: 'error', message: error_description || error })
        );
      }

      // Validate required parameters
      if (!code || !state) {
        return res.redirect(
          buildRedirectUrl(redirectToFrontend, { linkedin: 'error', message: 'Missing code or state' })
        );
      }

      // Verify and decode state
      let decoded;
      try {
        console.log('🔍 Verifying LinkedIn state token...');
        console.log('State token (first 50 chars):', state.substring(0, 50) + '...');
        console.log('JWT Secret exists:', !!config.JWT_SECRET);
        
        // Try to decode the state token (it might be URL encoded)
        let stateToVerify = state;
        try {
          stateToVerify = decodeURIComponent(state);
          console.log('✅ State token URL decoded successfully');
        } catch (decodeError) {
          console.log('ℹ️ State token is not URL encoded, using as-is');
        }
        
        decoded = jwt.verify(stateToVerify, config.JWT_SECRET, {
          issuer: 'bloocube-api',
          audience: 'bloocube-client'
        });
        console.log('✅ State token verified successfully');
        console.log('Decoded state:', {
          userId: decoded.userId,
          redirectUri: decoded.redirectUri,
          timestamp: decoded.timestamp,
          iat: decoded.iat,
          exp: decoded.exp
        });
        
        // Validate required fields in decoded state
        if (!decoded.userId) {
          throw new Error('Missing userId in state token');
        }
        if (!decoded.redirectUri) {
          throw new Error('Missing redirectUri in state token');
        }
      } catch (e) {
        console.error('❌ Invalid state token:', e.message);
        console.error('State token:', state);
        console.error('JWT Secret length:', config.JWT_SECRET ? config.JWT_SECRET.length : 'undefined');
        console.error('Error details:', e);
        return res.redirect(
          buildRedirectUrl(redirectToFrontend, { linkedin: 'error', message: 'Invalid or expired state' })
        );
      }

      // Extract redirectUri from decoded state
      const redirectUri = decoded.redirectUri || config.LINKEDIN_REDIRECT_URI;
      
      if (!redirectUri) {
        return res.redirect(
          buildRedirectUrl(redirectToFrontend, { linkedin: 'error', message: 'Missing redirect URI' })
        );
      }

      console.log(`🔄 Processing LinkedIn callback for user: ${decoded.userId}`);

      // STEP 1: Exchange authorization code for access token
      const tokenResult = await linkedinService.exchangeCodeForToken(code, redirectUri);
      
      if (!tokenResult.success) {
        const detail = tokenResult.raw?.error_description || tokenResult.error;
        console.error('Token exchange failed:', detail);
        return res.redirect(
          buildRedirectUrl(redirectToFrontend, { linkedin: 'error', message: detail || 'Token exchange failed' })
        );
      }

      console.log('✅ Access token obtained');

      // STEP 2: Fetch user profile from LinkedIn
      const profileResult = await linkedinService.getUserProfile(tokenResult.access_token);
      
      if (!profileResult.success) {
        const detail = profileResult.raw?.message || profileResult.error;
        console.error('Profile fetch failed:', detail);
        return res.redirect(
          buildRedirectUrl(redirectToFrontend, { linkedin: 'error', message: detail || 'Profile fetch failed' })
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

      const updatedUser = await User.findByIdAndUpdate(
        decoded.userId,
        { $set: updateData },
        { 
          new: true, // Return updated document
          runValidators: true // Run schema validators
        }
      );

      console.log('✅ LinkedIn account connected successfully');

      // STEP 4: Generate session token for auto-login
      const jwtManager = require('../utils/jwt');
      const sessionToken = jwtManager.generateAccessToken({
        id: updatedUser._id,
        email: updatedUser.email,
        role: updatedUser.role
      });

      console.log('🔑 Session token generated for auto-login');

      // STEP 5: Redirect to frontend with success and session token
      return res.redirect(buildRedirectUrl(redirectToFrontend, { 
        linkedin: 'success', 
        token: sessionToken, 
        message: 'LinkedIn connected and logged in successfully' 
      }));

    } catch (error) {
      console.error('❌ LinkedIn callback error:', error);
      return res.redirect(
        buildRedirectUrl(redirectToFrontend, { linkedin: 'error', message: error.message || 'Callback failed' })
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
      
      // If no LinkedIn account or tokens, return disconnected
      if (!linkedinAccount || (!linkedinAccount.accessToken && !linkedinAccount.refreshToken)) {
        return res.json({ success: true, connected: false });
      }

      let accessToken = linkedinAccount.accessToken;
      const expiresAt = linkedinAccount.expiresAt ? new Date(linkedinAccount.expiresAt) : null;
      const now = new Date();

      // Refresh if expired or expiring within 2 minutes
      if (!accessToken || (expiresAt && expiresAt.getTime() - now.getTime() < 2 * 60 * 1000)) {
        if (linkedinAccount.refreshToken) {
          console.log('🔄 LinkedIn token expired or expiring soon, refreshing...');
          const refreshResult = await linkedinService.refreshToken(linkedinAccount.refreshToken);
          if (refreshResult?.success) {
            accessToken = refreshResult.access_token;
            // Update tokens in database
            await User.findByIdAndUpdate(userId, {
              $set: {
                'socialAccounts.linkedin.accessToken': refreshResult.access_token,
                'socialAccounts.linkedin.refreshToken': refreshResult.refresh_token || linkedinAccount.refreshToken,
                'socialAccounts.linkedin.expiresAt': new Date(Date.now() + (refreshResult.expires_in || 3600) * 1000)
              }
            });
            console.log('✅ LinkedIn token refreshed successfully');
          } else {
            // Refresh failed → treat as disconnected but do not erase tokens automatically
            console.log('❌ LinkedIn token refresh failed:', refreshResult?.error);
            return res.json({ success: true, connected: false, expired: true });
          }
        } else {
          // No refresh token available
          return res.json({ success: true, connected: false, expired: true });
        }
      }

      // Lightweight live validation: try fetching profile info
      try {
        const profileResult = await linkedinService.getUserProfile(accessToken);
        if (profileResult && profileResult.success) {
          return res.json({ 
            success: true, 
            connected: true,
            account: {
              email: linkedinAccount.email,
              name: linkedinAccount.name,
              connectedAt: linkedinAccount.connectedAt
            }
          });
        }
        return res.json({ success: true, connected: false });
      } catch (e) {
        console.error('LinkedIn profile validation error:', e);
        return res.json({ success: true, connected: false });
      }

    } catch (error) {
      console.error('Error getting LinkedIn status:', error);
      res.status(500).json({ 
        success: false, 
        error: 'Failed to get LinkedIn status',
        details: error.message 
      });
    }
  }

  /**
   * Get LinkedIn Profile
   * @route GET /api/linkedin/profile
   */
 // src/controllers/linkedinController.js

  async getProfile(req, res) {
   try {
     const userId = req.userId || req.user?._id || req.user?.id;
     
     if (!userId) {
       return res.status(401).json({ 
         success: false, 
         error: 'User not authenticated' 
       });
     }

     const user = await User.findById(userId).select('socialAccounts.linkedin');

     if (!user || !user.socialAccounts?.linkedin) {
       return res.status(400).json({ success: false, error: 'LinkedIn not connected' });
     }

     const linkedinAccount = user.socialAccounts.linkedin;
     let accessToken = linkedinAccount.accessToken;
     const expiresAt = linkedinAccount.expiresAt ? new Date(linkedinAccount.expiresAt) : null;
     const now = new Date();

     // Check if token is expired or expiring soon and refresh if needed
     if (!accessToken || (expiresAt && expiresAt.getTime() - now.getTime() < 2 * 60 * 1000)) {
       if (linkedinAccount.refreshToken) {
         console.log('🔄 LinkedIn token expired or expiring soon, refreshing before profile fetch...');
         const refreshResult = await linkedinService.refreshToken(linkedinAccount.refreshToken);
         if (refreshResult?.success) {
           accessToken = refreshResult.access_token;
           // Update tokens in database
           await User.findByIdAndUpdate(userId, {
             $set: {
               'socialAccounts.linkedin.accessToken': refreshResult.access_token,
               'socialAccounts.linkedin.refreshToken': refreshResult.refresh_token || linkedinAccount.refreshToken,
               'socialAccounts.linkedin.expiresAt': new Date(Date.now() + (refreshResult.expires_in || 3600) * 1000)
             }
           });
           console.log('✅ LinkedIn token refreshed successfully');
           // Update the user object for response
           linkedinAccount.accessToken = refreshResult.access_token;
         } else {
           console.log('❌ LinkedIn token refresh failed:', refreshResult?.error);
           return res.status(200).json({ 
             success: false, 
             error: refreshResult?.error || 'LinkedIn token invalid or expired. Please reconnect your account.' 
           });
         }
       } else {
         return res.status(200).json({ 
           success: false, 
           error: 'LinkedIn token expired and no refresh token available. Please reconnect your account.' 
         });
       }
     }

     // Live-validate the token via LinkedIn userinfo; if invalid, report disconnected
     const live = await linkedinService.getUserProfile(accessToken);
     if (!live.success) {
       return res.status(200).json({ 
         success: false, 
         error: live.error || 'LinkedIn token invalid or expired' 
       });
     }

     return res.json({ success: true, profile: linkedinAccount });

  } catch (error) {
    console.error('Error getting LinkedIn profile:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get LinkedIn profile'
    });
  }
  }
}

module.exports = new LinkedInController();