
// src/middlewares/auth.js
const jwtManager = require('../utils/jwt');
const User = require('../models/User');
const logger = require('../utils/logger');
const { HTTP_STATUS, ERROR_MESSAGES } = require('../utils/constants');
const { getAccessTokenFromCookie, getRefreshTokenFromCookie, getUserDataFromCookie } = require('../utils/cookies');
const tokenBlacklist = require('../services/tokenBlacklist');

/**
 * Authentication middleware
 * Verifies JWT token and attaches user to request
 */
const authenticate = async (req, res, next) => {
  try {
    console.log("🔑 Auth check:", {
      hasAuthHeader: !!req.headers.authorization,
      hasAccessTokenCookie: !!getAccessTokenFromCookie(req),
      url: req.originalUrl,
      method: req.method
    });

    let token = null;
    let user = null;

    // First, try to get token from HttpOnly cookie (preferred method)
    token = getAccessTokenFromCookie(req);
    
    // Fallback to Authorization header for API clients
    if (!token && req.headers.authorization) {
      try {
        token = jwtManager.extractTokenFromHeader(req.headers.authorization);
      } catch (headerError) {
        // Ignore header parsing errors, continue with cookie check
        console.log("Header token parsing failed, trying cookies only");
      }
    }
    
    if (!token) {
      return res.status(HTTP_STATUS.UNAUTHORIZED).json({
        success: false,
        message: ERROR_MESSAGES.INVALID_TOKEN
      });
    }

    // Check blacklist
    if (await tokenBlacklist.isBlacklisted(token)) {
      return res.status(HTTP_STATUS.UNAUTHORIZED).json({ success: false, message: ERROR_MESSAGES.INVALID_TOKEN });
    }

    // Verify token
    const decoded = jwtManager.verifyAccessToken(token);
    
    // Try to get user from cookie first (faster)
    user = getUserDataFromCookie(req);
    
    // If no user data in cookie or user ID doesn't match, fetch from database
    if (!user || user.id !== decoded.id) {
      user = await User.findById(decoded.id).select('-password');
      
      if (!user) {
        return res.status(HTTP_STATUS.UNAUTHORIZED).json({
          success: false,
          message: ERROR_MESSAGES.USER_NOT_FOUND
        });
      }
    }

    if (!user.isActive) {
      return res.status(HTTP_STATUS.UNAUTHORIZED).json({
        success: false,
        message: 'Account is deactivated'
      });
    }

    // Attach user to request
    req.user = user;
    req.userId = user._id || user.id;
    
    logger.info('User authenticated', { 
      userId: user._id || user.id, 
      email: user.email, 
      role: user.role,
      authMethod: token === getAccessTokenFromCookie(req) ? 'cookie' : 'header'
    });
    
    next();
  } catch (error) {
    logger.error('Authentication error', error);
    return res.status(HTTP_STATUS.UNAUTHORIZED).json({
      success: false,
      message: ERROR_MESSAGES.INVALID_TOKEN
    });
  }
};

/**
 * Authorization middleware
 * Checks if user has required role
 */
const authorize = (...roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(HTTP_STATUS.UNAUTHORIZED).json({
        success: false,
        message: ERROR_MESSAGES.INVALID_TOKEN
      });
    }

    if (!roles.includes(req.user.role)) {
      logger.warn('Authorization failed', { 
        userId: req.user._id, 
        userRole: req.user.role, 
        requiredRoles: roles 
      });
      
      return res.status(HTTP_STATUS.FORBIDDEN).json({
        success: false,
        message: ERROR_MESSAGES.ACCESS_DENIED
      });
    }

    next();
  };
};

/**
 * Optional authentication middleware
 * Attaches user if token is valid, but doesn't require it
 */
const optionalAuth = async (req, res, next) => {
  try {
    let token = null;
    let user = null;

    // First, try to get token from HttpOnly cookie
    token = getAccessTokenFromCookie(req);
    
    // Fallback to Authorization header
    if (!token && req.headers.authorization) {
      try {
        token = jwtManager.extractTokenFromHeader(req.headers.authorization);
      } catch (headerError) {
        // Ignore header parsing errors
      }
    }
    
    if (!token) {
      return next();
    }

    const decoded = jwtManager.verifyAccessToken(token);
    
    // Try to get user from cookie first
    user = getUserDataFromCookie(req);
    
    // If no user data in cookie or user ID doesn't match, fetch from database
    if (!user || user.id !== decoded.id) {
      user = await User.findById(decoded.id).select('-password');
    }
    
    if (user && user.isActive) {
      req.user = user;
      req.userId = user._id || user.id;
    }
    
    next();
  } catch (error) {
    // Continue without authentication for optional auth
    next();
  }
};

/**
 * Resource ownership middleware
 * Ensures user can only access their own resources
 */
const checkResourceOwnership = (resourceIdParam = 'id', userIdField = 'user_id') => {
  return (req, res, next) => {
    const resourceId = req.params[resourceIdParam];
    const userId = req.userId;
    
    // Admin can access all resources
    if (req.user.role === 'admin') {
      return next();
    }
    
    // Check if user owns the resource
    if (req.resource && req.resource[userIdField].toString() !== userId.toString()) {
      logger.warn('Resource ownership check failed', { 
        userId, 
        resourceId, 
        resourceOwner: req.resource[userIdField] 
      });
      
      return res.status(HTTP_STATUS.FORBIDDEN).json({
        success: false,
        message: ERROR_MESSAGES.ACCESS_DENIED
      });
    }
    
    next();
  };
};

/**
 * Campaign ownership middleware
 * Ensures only campaign owner can modify campaign
 */
const checkCampaignOwnership = async (req, res, next) => {
  try {
    const campaignId = req.params.id;
    const userId = req.userId;
    
    // Admin can access all campaigns
    if (req.user.role === 'admin') {
      return next();
    }
    
    const Campaign = require('../models/Campaign');
    const campaign = await Campaign.findById(campaignId);
    
    if (!campaign) {
      return res.status(HTTP_STATUS.NOT_FOUND).json({
        success: false,
        message: 'Campaign not found'
      });
    }
    
    if (campaign.brand_id.toString() !== userId.toString()) {
      logger.warn('Campaign ownership check failed', { 
        userId, 
        campaignId, 
        campaignOwner: campaign.brand_id 
      });
      
      return res.status(HTTP_STATUS.FORBIDDEN).json({
        success: false,
        message: ERROR_MESSAGES.ACCESS_DENIED
      });
    }
    
    req.campaign = campaign;
    next();
  } catch (error) {
    logger.error('Campaign ownership check error', error);
    return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: ERROR_MESSAGES.INTERNAL_ERROR
    });
  }
};

/**
 * Bid ownership middleware
 * Ensures only bid owner can modify bid
 */
const checkBidOwnership = async (req, res, next) => {
  try {
    const bidId = req.params.id;
    const userId = req.userId;
    
    // Admin can access all bids
    if (req.user.role === 'admin') {
      return next();
    }
    
    const Bid = require('../models/Bid');
    const bid = await Bid.findById(bidId);
    
    if (!bid) {
      return res.status(HTTP_STATUS.NOT_FOUND).json({
        success: false,
        message: 'Bid not found'
      });
    }
    
    // Check if user is bid creator or campaign owner
    const Campaign = require('../models/Campaign');
    const campaign = await Campaign.findById(bid.campaign_id);
    
    if (bid.creator_id.toString() !== userId.toString() && 
        campaign.brand_id.toString() !== userId.toString()) {
      logger.warn('Bid ownership check failed', { 
        userId, 
        bidId, 
        bidCreator: bid.creator_id,
        campaignOwner: campaign.brand_id
      });
      
      return res.status(HTTP_STATUS.FORBIDDEN).json({
        success: false,
        message: ERROR_MESSAGES.ACCESS_DENIED
      });
    }
    
    req.bid = bid;
    req.campaign = campaign;
    next();
  } catch (error) {
    logger.error('Bid ownership check error', error);
    return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: ERROR_MESSAGES.INTERNAL_ERROR
    });
  }
};

/**
 * Refresh token middleware
 * Handles refresh token validation and new token generation
 */
const refreshToken = async (req, res, next) => {
  try {
    // Get refresh token from cookie first, then from body
    let refreshTokenValue = getRefreshTokenFromCookie(req);
    
    if (!refreshTokenValue && req.body.refreshToken) {
      refreshTokenValue = req.body.refreshToken;
    }
    
    if (!refreshTokenValue) {
      return res.status(HTTP_STATUS.BAD_REQUEST).json({
        success: false,
        message: 'Refresh token is required'
      });
    }
    
    // Check blacklist before verifying
    if (await tokenBlacklist.isBlacklisted(refreshTokenValue)) {
      return res.status(HTTP_STATUS.UNAUTHORIZED).json({
        success: false,
        message: ERROR_MESSAGES.INVALID_TOKEN
      });
    }

    const decoded = jwtManager.verifyRefreshToken(refreshTokenValue);
    const user = await User.findById(decoded.id);
    
    if (!user || !user.isActive) {
      return res.status(HTTP_STATUS.UNAUTHORIZED).json({
        success: false,
        message: ERROR_MESSAGES.INVALID_TOKEN
      });
    }
    
    // Generate new token pair
    const tokenPair = jwtManager.generateTokenPair({
      id: user._id,
      email: user.email,
      role: user.role
    });
    
    // Update last login
    user.lastLogin = new Date();
    await user.save();
    
    // Blacklist the old refresh token to prevent reuse
    try { await tokenBlacklist.blacklistToken(refreshTokenValue); } catch {}

    // Set new cookies
    const { setAuthCookies } = require('../utils/cookies');
    setAuthCookies(res, tokenPair.accessToken, tokenPair.refreshToken, user);
    
    logger.info('Token refreshed', { userId: user._id });
    
    res.json({
      success: true,
      message: 'Token refreshed successfully',
      data: {
        user: {
          id: user._id,
          name: user.name,
          email: user.email,
          role: user.role,
          profile: user.profile,
          isActive: user.isActive,
          isVerified: user.isVerified
        }
        // Tokens are now in HttpOnly cookies
      }
    });
  } catch (error) {
    logger.error('Token refresh error', error);
    return res.status(HTTP_STATUS.UNAUTHORIZED).json({
      success: false,
      message: ERROR_MESSAGES.INVALID_TOKEN
    });
  }
};

/**
 * Password reset token middleware
 * Validates password reset token and extracts redirectTo info
 */
const validatePasswordResetToken = async (req, res, next) => {
  try {
    const { token } = req.params;
    
    if (!token) {
      return res.status(HTTP_STATUS.BAD_REQUEST).json({
        success: false,
        message: 'Reset token is required'
      });
    }
    
    const decoded = jwtManager.verifyPasswordResetToken(token);
    const user = await User.findById(decoded.id);
    
    if (!user || !user.isActive) {
      return res.status(HTTP_STATUS.UNAUTHORIZED).json({
        success: false,
        message: 'Invalid or expired reset token'
      });
    }
    
    req.user = user;
    req.userId = user._id;
    req.redirectTo = decoded.redirectTo || 'login'; // Extract redirectTo from token, default to 'login'
    next();
  } catch (error) {
    logger.error('Password reset token validation error', error);
    return res.status(HTTP_STATUS.UNAUTHORIZED).json({
      success: false,
      message: 'Invalid or expired reset token'
    });
  }
};

module.exports = {
  authenticate,
  authorize,
  optionalAuth,
  checkResourceOwnership,
  checkCampaignOwnership,
  checkBidOwnership,
  refreshToken,
  validatePasswordResetToken
};
