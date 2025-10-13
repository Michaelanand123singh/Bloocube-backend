const asyncHandler = require('express-async-handler');
const axios = require('axios');
const config = require('../config/env');

// Facebook OAuth configuration
const FACEBOOK_CLIENT_ID = config.FACEBOOK_APP_ID;
const FACEBOOK_CLIENT_SECRET = config.FACEBOOK_APP_SECRET;
const FACEBOOK_REDIRECT_URI = `${config.BASE_URL}/api/facebook/callback`;

// Generate Facebook OAuth URL
const generateAuthURL = asyncHandler(async (req, res) => {
  const userId = req.userId;
  const { redirectUri } = req.body;

  try {
    const state = `${userId}_${Date.now()}`;
    const scope = 'email,public_profile,pages_manage_posts,pages_read_engagement';
    
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
  const { code, state, redirectUri } = req.body;

  try {
    if (!code) {
      return res.status(400).json({
        success: false,
        error: 'Authorization code not provided'
      });
    }

    // Exchange code for access token
    const tokenResponse = await axios.post('https://graph.facebook.com/v18.0/oauth/access_token', {
      client_id: FACEBOOK_CLIENT_ID,
      client_secret: FACEBOOK_CLIENT_SECRET,
      redirect_uri: redirectUri || FACEBOOK_REDIRECT_URI,
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

    // Store the access token and profile info (in a real app, store in database)
    // For now, we'll just return success
    console.log('Facebook user connected:', {
      userId: profile.id,
      name: profile.name,
      email: profile.email
    });

    res.json({
      success: true,
      message: 'Facebook account connected successfully',
      profile: {
        id: profile.id,
        name: profile.name,
        email: profile.email,
        picture: profile.picture?.data?.url
      }
    });
  } catch (error) {
    console.error('Facebook callback error:', error.response?.data || error.message);
    res.status(500).json({
      success: false,
      error: 'Failed to process Facebook callback'
    });
  }
});

// Get Facebook profile
const getProfile = asyncHandler(async (req, res) => {
  const userId = req.userId;

  try {
    // In a real app, retrieve from database
    // For now, return mock data
    res.json({
      success: true,
      profile: {
        id: 'mock_facebook_user',
        name: 'Mock Facebook User',
        email: 'mock@facebook.com',
        picture: {
          data: {
            url: 'https://via.placeholder.com/200'
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
    // In a real app, remove from database
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
    // In a real app, check database for valid token
    // For now, return mock validation
    res.json({
      success: true,
      connected: true,
      profile: {
        id: 'mock_facebook_user',
        name: 'Mock Facebook User',
        email: 'mock@facebook.com'
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
  validateConnection
};
