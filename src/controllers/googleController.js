const googleService = require('../services/social/google');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const config = require('../config/env');
const { getFrontendUrl, getLoginUrl, buildRedirectUrl } = require('../utils/urlUtils');

class GoogleController {
  async generateAuthURL(req, res) {
    const redirectUri = (req.body && req.body.redirectUri) || req.query.redirectUri;
    // Use optional user ID if available, otherwise generate a guest identifier
    const userId = (req.userId || req.user?._id) || `guest_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const state = jwt.sign({ userId }, config.JWT_SECRET, { expiresIn: '30m' });
    const authURL = googleService.generateAuthURL(redirectUri, state);
    res.json({ success: true, authURL, state, redirectUri });
  }

  async handleCallback(req, res) {
    // Use the redirectUri to determine the frontend URL instead of hardcoded config
    const { code, state, redirectUri } = req.query;
    if (!code || !state || !redirectUri) {
      const loginUrl = getLoginUrl();
      return res.redirect(buildRedirectUrl(loginUrl, { google: 'error', message: 'Missing code state or redirectUri' }));
    }

    // Extract the frontend URL from the redirectUri
    const redirectBase = redirectUri.replace('/auth/google/callback', '');
    
    try {

      let decoded;
      try {
        decoded = jwt.verify(state, config.JWT_SECRET);
      } catch (e) {
        return res.redirect(buildRedirectUrl(`${redirectBase}/login`, { google: 'error', message: 'Invalid state' }));
      }

      const tokenResult = await googleService.exchangeCodeForToken(code, redirectUri);
      if (!tokenResult.success) {
        const detail = tokenResult.raw?.error_description || tokenResult.error;
        return res.redirect(buildRedirectUrl(`${redirectBase}/login`, { google: 'error', message: detail || 'Token exchange failed' }));
      }

      const userInfo = await googleService.getUserInfo(tokenResult.access_token);
      if (!userInfo.success) {
        const detail = userInfo.raw?.error_description || userInfo.error;
        return res.redirect(buildRedirectUrl(`${redirectBase}/login`, { google: 'error', message: detail || 'Userinfo failed' }));
      }

      // Find or create user
      const email = (userInfo.user.email || '').toLowerCase();
      let user = await User.findByEmail(email);
      if (!user) {
        user = new User({
          name: userInfo.user.name || userInfo.user.given_name || 'Google User',
          email,
          password: Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2),
          isVerified: true
        });
        await user.save();
      }

      // Issue tokens
      const jwtManager = require('../utils/jwt');
      const tokenPair = jwtManager.generateTokenPair({ id: user._id, email: user.email, role: user.role });

      // Use the standardized cookie utility to set authentication cookies
      const { setAuthCookies } = require('../utils/cookies');
      setAuthCookies(res, tokenPair.accessToken, tokenPair.refreshToken, user);
      // Log cookie setting for debugging
      console.log('🍪 Setting cookies for Google login:', {
        userId: user._id,
        email: user.email,
        role: user.role,
        redirectBase: redirectBase,
        usingStandardizedCookies: true
      });
      
      // Redirect back to frontend callback with token for auto-login (mirrors LinkedIn flow)
      return res.redirect(buildRedirectUrl(`${redirectBase}/auth/google/callback`, { 
        google: 'success', 
        token: tokenPair.accessToken, 
        message: 'Google login successful' 
      }));
    } catch (error) {
      return res.redirect(buildRedirectUrl(`${redirectBase}/login`, { 
        google: 'error', 
        message: error.message || 'Callback failed' 
      }));
    }
  }
}

module.exports = new GoogleController();


