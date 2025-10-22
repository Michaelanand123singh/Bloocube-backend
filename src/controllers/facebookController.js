const asyncHandler = require('express-async-handler');
const axios = require('axios');
const jwt = require('jsonwebtoken');
const config = require('../config/env');
const User = require('../models/User');

// Facebook OAuth configuration
const FACEBOOK_CLIENT_ID = config.FACEBOOK_APP_ID;
const FACEBOOK_CLIENT_SECRET = config.FACEBOOK_APP_SECRET;
const FACEBOOK_REDIRECT_URI = `${config.BASE_URL}/api/facebook/callback`;

// Generate Facebook OAuth URL
const generateAuthURL = asyncHandler(async (req, res) => {
  const userId = req.userId;
  const { redirectUri } = req.body;

  try {
    // Check if Facebook credentials are configured
    if (!FACEBOOK_CLIENT_ID || !FACEBOOK_CLIENT_SECRET) {
      return res.status(400).json({
        success: false,
        error: 'Facebook API credentials not configured. Please set FACEBOOK_APP_ID and FACEBOOK_APP_SECRET in environment variables.'
      });
    }

    // Create a JWT state token for security
    const statePayload = {
      userId,
      redirectUri: redirectUri || FACEBOOK_REDIRECT_URI,
      timestamp: Date.now()
    };
    const state = jwt.sign(statePayload, config.JWT_SECRET, { expiresIn: '10m' });
    
    const scope = 'email,public_profile,pages_manage_posts,pages_read_engagement,pages_show_list';
    
    const authURL = `https://www.facebook.com/v18.0/dialog/oauth?` +
      `client_id=${FACEBOOK_CLIENT_ID}&` +
      `redirect_uri=${encodeURIComponent(redirectUri || FACEBOOK_REDIRECT_URI)}&` +
      `scope=${encodeURIComponent(scope)}&` +
      `state=${state}&` +
      `response_type=code`;

    res.json({
      success: true,
      authURL,
      state
    });
  } catch (error) {
    console.error('Facebook auth URL generation error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to generate Facebook auth URL'
    });
  }
});

// Handle Facebook OAuth callback
const handleCallback = asyncHandler(async (req, res) => {
  // Extract frontend URL from the redirectUri in the state
  const { code, state } = req.query;
  let redirectToFrontend = `${config.FRONTEND_URL || 'http://localhost:3000'}/creator/settings`;
  
    // Try to extract the frontend URL from the state if available
    try {
      const decoded = jwt.verify(state, config.JWT_SECRET);
      if (decoded.redirectUri) {
        // The redirectUri in state is the backend callback URL, not frontend
        // We should use the config.FRONTEND_URL instead
        console.log('🔍 Facebook state decoded, using config.FRONTEND_URL:', config.FRONTEND_URL);
        redirectToFrontend = `${config.FRONTEND_URL || 'http://localhost:3000'}/creator/settings`;
      }
    } catch (e) {
      // If state is invalid, use fallback URL
      console.log('Could not decode state, using fallback frontend URL');
    }
  
  try {
    const { code, state, error, error_description } = req.query;

    // Handle user denial or Facebook errors
    if (error) {
      console.log('Facebook OAuth error:', error, error_description);
      return res.redirect(
        `${redirectToFrontend}/creator/settings?facebook=error&message=${encodeURIComponent(error_description || error)}`
      );
    }

    // Validate required parameters
    if (!code || !state) {
      return res.redirect(
        `${redirectToFrontend}/creator/settings?facebook=error&message=Missing+code+or+state`
      );
    }

    // Verify and decode state
    let decoded;
    try {
      decoded = jwt.verify(state, config.JWT_SECRET);
    } catch (e) {
      console.error('Invalid state token:', e.message);
      return res.redirect(
        `${redirectToFrontend}/creator/settings?facebook=error&message=Invalid+or+expired+state`
      );
    }

    // Extract redirectUri from decoded state
    const redirectUri = decoded.redirectUri || FACEBOOK_REDIRECT_URI;
    
    if (!redirectUri) {
      return res.redirect(
        `${redirectToFrontend}/creator/settings?facebook=error&message=Missing+redirect+URI`
      );
    }

    console.log(`🔄 Processing Facebook callback for user: ${decoded.userId}`);

    // Exchange code for access token
    const tokenResponse = await axios.post('https://graph.facebook.com/v18.0/oauth/access_token', {
      client_id: FACEBOOK_CLIENT_ID,
      client_secret: FACEBOOK_CLIENT_SECRET,
      redirect_uri: redirectUri,
      code
    });

    const { access_token } = tokenResponse.data;

    // Get user profile
    const profileResponse = await axios.get(`https://graph.facebook.com/v18.0/me`, {
      params: {
        access_token,
        fields: 'id,name,email,picture'
      }
    });

    const profile = profileResponse.data;

    // Store the access token and profile info in database
    const user = await User.findById(decoded.userId);
    if (!user) {
      console.error('User not found:', decoded.userId);
        return res.redirect(
          `${redirectToFrontend}/creator/settings?facebook=error&message=User+not+found`
        );
    }

    // Update user's Facebook account info
    user.socialAccounts.facebook = {
      id: profile.id,
      username: profile.name.toLowerCase().replace(/\s+/g, ''),
      name: profile.name,
      accessToken: access_token,
      refreshToken: '', // Facebook doesn't provide refresh tokens
      expiresAt: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000), // 60 days from now
      connectedAt: new Date()
    };

    await user.save();

    console.log('Facebook user connected and saved to database:', {
      userId: profile.id,
      name: profile.name,
      email: profile.email,
      userDbId: decoded.userId
    });

    // Redirect to frontend with success
    return res.redirect(
      `${redirectToFrontend}/creator/settings?facebook=success&message=Facebook+account+connected+successfully`
    );

  } catch (error) {
    console.error('Facebook callback error:', error.response?.data || error.message);
    return res.redirect(
      `${redirectToFrontend}/creator/settings?facebook=error&message=Failed+to+process+Facebook+callback`
    );
  }
});

// Get Facebook profile
const getProfile = asyncHandler(async (req, res) => {
  const userId = req.userId;

  try {
    const user = await User.findById(userId).select('socialAccounts.facebook');
    
    // Check if Facebook account exists and has required fields
    if (!user || !user.socialAccounts.facebook || !user.socialAccounts.facebook.id || !user.socialAccounts.facebook.accessToken) {
      return res.json({
        success: false,
        error: 'Facebook account not connected'
      });
    }

    const facebookAccount = user.socialAccounts.facebook;
    
    res.json({
      success: true,
      profile: {
        id: facebookAccount.id,
        name: facebookAccount.name,
        username: facebookAccount.username,
        connectedAt: facebookAccount.connectedAt,
        picture: {
          data: {
            url: `https://graph.facebook.com/${facebookAccount.id}/picture?type=large`
          }
        }
      }
    });
  } catch (error) {
    console.error('Facebook profile fetch error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch Facebook profile'
    });
  }
});

// Disconnect Facebook account
const disconnect = asyncHandler(async (req, res) => {
  const userId = req.userId;

  try {
    const user = await User.findById(userId);
    
    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }

    // Clear Facebook account data
    user.socialAccounts.facebook = {
      id: undefined,
      username: undefined,
      name: undefined,
      accessToken: undefined,
      refreshToken: undefined,
      expiresAt: undefined,
      connectedAt: undefined
    };

    await user.save();

    console.log('Facebook account disconnected for user:', userId);
    
    res.json({
      success: true,
      message: 'Facebook account disconnected successfully'
    });
  } catch (error) {
    console.error('Facebook disconnect error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to disconnect Facebook account'
    });
  }
});

// Validate Facebook connection
const validateConnection = asyncHandler(async (req, res) => {
  const userId = req.userId;

  try {
    const user = await User.findById(userId).select('socialAccounts.facebook');
    
    // Check if Facebook account exists and has required fields
    if (!user || !user.socialAccounts.facebook || !user.socialAccounts.facebook.id || !user.socialAccounts.facebook.accessToken) {
      return res.json({
        success: true,
        connected: false,
        profile: null
      });
    }

    const facebookAccount = user.socialAccounts.facebook;
    
    // Facebook connection is considered valid if it exists in database
    // No need to validate token with Facebook API unless specifically required
    res.json({
      success: true,
      connected: true,
      profile: {
        id: facebookAccount.id,
        name: facebookAccount.name,
        username: facebookAccount.username,
        connectedAt: facebookAccount.connectedAt
      }
    });
  } catch (error) {
    console.error('Facebook validation error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to validate Facebook connection'
    });
  }
});

module.exports = {
  generateAuthURL,
  handleCallback,
  getProfile,
  disconnect,
  validateConnection,
  // New export: postContent to publish to a connected Facebook Page
  postContent: asyncHandler(async (req, res) => {
    const userId = req.userId;
    const { message, imageUrl, pageId } = req.body;

    try {
      const user = await User.findById(userId).select('socialAccounts.facebook');
      if (!user || !user.socialAccounts?.facebook?.accessToken) {
        return res.status(400).json({ success: false, error: 'Facebook account not connected' });
      }

      const userAccessToken = user.socialAccounts.facebook.accessToken;

      // Fetch user pages to obtain a Page Access Token
      const pagesResp = await axios.get('https://graph.facebook.com/v18.0/me/accounts', {
        params: { access_token: userAccessToken, fields: 'id,name,access_token' }
      });

      const pages = pagesResp.data?.data || [];
      if (pages.length === 0) {
        return res.status(400).json({ success: false, error: 'No Facebook Pages found for this user' });
      }

      const selectedPage = pageId ? pages.find(p => p.id === pageId) : pages[0];
      if (!selectedPage) {
        return res.status(400).json({ success: false, error: 'Specified Page not found for this user' });
      }

      const pageAccessToken = selectedPage.access_token;
      const targetPageId = selectedPage.id;

      // If imageUrl is provided, create a photo post with URL first; fallback to binary upload
      if (imageUrl) {
        try {
          const photoResp = await axios.post(`https://graph.facebook.com/v18.0/${targetPageId}/photos`, null, {
            params: {
              url: imageUrl,
              caption: message || '',
              access_token: pageAccessToken
            }
          });

          return res.json({ success: true, type: 'photo', id: photoResp.data?.post_id || photoResp.data?.id, pageId: targetPageId });
        } catch (err) {
          const fbErr = err.response?.data?.error;
          const needsBinaryUpload = fbErr?.code === 324 || fbErr?.error_subcode === 2069019;
          if (!needsBinaryUpload) throw err;

          // Attempt binary upload from local storage if path is ours
          let localFilePath = null;
          let filename = 'image.jpg';
          let contentType = 'image/jpeg';
          try {
            const path = require('path');
            const fs = require('fs');
            const FormData = require('form-data');
            const uploadsIndex = typeof imageUrl === 'string' ? imageUrl.indexOf('/uploads/') : -1;
            if (uploadsIndex !== -1) {
              const relativePath = imageUrl.substring(uploadsIndex + 1);
              localFilePath = path.join(__dirname, '..', '..', relativePath);
              filename = path.basename(localFilePath);
            }
            if (localFilePath && fs.existsSync(localFilePath)) {
              const buffer = fs.readFileSync(localFilePath);
              const form = new (FormData)();
              form.append('source', buffer, { filename, contentType });
              form.append('caption', message || '');
              form.append('access_token', pageAccessToken);
              const uploadResp = await axios.post(`https://graph.facebook.com/v18.0/${targetPageId}/photos`, form, {
                headers: form.getHeaders()
              });
              return res.json({ success: true, type: 'photo', id: uploadResp.data?.post_id || uploadResp.data?.id, pageId: targetPageId, fallback: 'binary' });
            }
          } catch {}

          // Last resort: degrade to text-only feed post
          const feedRespFallback = await axios.post(`https://graph.facebook.com/v18.0/${targetPageId}/feed`, null, {
            params: {
              message: message || '',
              access_token: pageAccessToken
            }
          });
          return res.json({ success: true, type: 'feed', id: feedRespFallback.data?.id, pageId: targetPageId, fallback: 'text_only' });
        }
      }

      const feedResp = await axios.post(`https://graph.facebook.com/v18.0/${targetPageId}/feed`, null, {
        params: {
          message: message || '',
          access_token: pageAccessToken
        }
      });

      return res.json({ success: true, type: 'feed', id: feedResp.data?.id, pageId: targetPageId });
    } catch (error) {
      const apiError = error.response?.data || { message: error.message };
      return res.status(400).json({ success: false, error: apiError?.error?.message || apiError.message || 'Failed to post content', details: apiError });
    }
  })
};
