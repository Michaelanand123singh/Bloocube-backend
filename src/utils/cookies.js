// src/utils/cookies.js
const config = require('../config/env');
const logger = require('./logger');

/**
 * Cookie configuration for secure authentication
 */
const COOKIE_CONFIG = {
  // Access token cookie
  accessToken: {
    name: 'access_token',
    httpOnly: true,
    secure: config.NODE_ENV === 'production',
    sameSite: 'strict',
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days in milliseconds
    path: '/'
  },
  // Refresh token cookie
  refreshToken: {
    name: 'refresh_token',
    httpOnly: true,
    secure: config.NODE_ENV === 'production',
    sameSite: 'strict',
    maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days in milliseconds
    path: '/'
  },
  // User data cookie (non-sensitive info only)
  userData: {
    name: 'user_data',
    httpOnly: true, // Allow frontend to read user data
    secure: config.NODE_ENV === 'production',
    sameSite: 'strict',
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days in milliseconds
    path: '/'
  }
};

/**
 * Set authentication cookies
 * @param {Object} res - Express response object
 * @param {String} accessToken - JWT access token
 * @param {String} refreshToken - JWT refresh token
 * @param {Object} user - User data (non-sensitive)
 */
const setAuthCookies = (res, accessToken, refreshToken, user) => {
  try {
    // Set access token cookie
    res.cookie(COOKIE_CONFIG.accessToken.name, accessToken, {
      httpOnly: COOKIE_CONFIG.accessToken.httpOnly,
      secure: COOKIE_CONFIG.accessToken.secure,
      sameSite: COOKIE_CONFIG.accessToken.sameSite,
      maxAge: COOKIE_CONFIG.accessToken.maxAge,
      path: COOKIE_CONFIG.accessToken.path
    });

    // Set refresh token cookie
    res.cookie(COOKIE_CONFIG.refreshToken.name, refreshToken, {
      httpOnly: COOKIE_CONFIG.refreshToken.httpOnly,
      secure: COOKIE_CONFIG.refreshToken.secure,
      sameSite: COOKIE_CONFIG.refreshToken.sameSite,
      maxAge: COOKIE_CONFIG.refreshToken.maxAge,
      path: COOKIE_CONFIG.refreshToken.path
    });

    // Set user data cookie (non-sensitive info only)
    const safeUserData = {
      id: user._id || user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      profile: user.profile,
      isActive: user.isActive,
      isVerified: user.isVerified
    };

    res.cookie(COOKIE_CONFIG.userData.name, JSON.stringify(safeUserData), {
      httpOnly: COOKIE_CONFIG.userData.httpOnly,
      secure: COOKIE_CONFIG.userData.secure,
      sameSite: COOKIE_CONFIG.userData.sameSite,
      maxAge: COOKIE_CONFIG.userData.maxAge,
      path: COOKIE_CONFIG.userData.path
    });

    logger.info('Auth cookies set successfully', { 
      userId: user._id || user.id,
      hasAccessToken: !!accessToken,
      hasRefreshToken: !!refreshToken
    });
  } catch (error) {
    logger.error('Error setting auth cookies', error);
    throw error;
  }
};

/**
 * Clear authentication cookies
 * @param {Object} res - Express response object
 */
const clearAuthCookies = (res) => {
  try {
    // Clear access token cookie
    res.clearCookie(COOKIE_CONFIG.accessToken.name, {
      path: COOKIE_CONFIG.accessToken.path,
      secure: COOKIE_CONFIG.accessToken.secure,
      sameSite: COOKIE_CONFIG.accessToken.sameSite
    });

    // Clear refresh token cookie
    res.clearCookie(COOKIE_CONFIG.refreshToken.name, {
      path: COOKIE_CONFIG.refreshToken.path,
      secure: COOKIE_CONFIG.refreshToken.secure,
      sameSite: COOKIE_CONFIG.refreshToken.sameSite
    });

    // Clear user data cookie
    res.clearCookie(COOKIE_CONFIG.userData.name, {
      path: COOKIE_CONFIG.userData.path,
      secure: COOKIE_CONFIG.userData.secure,
      sameSite: COOKIE_CONFIG.userData.sameSite
    });

    logger.info('Auth cookies cleared successfully');
  } catch (error) {
    logger.error('Error clearing auth cookies', error);
    throw error;
  }
};

/**
 * Get access token from cookies
 * @param {Object} req - Express request object
 * @returns {String|null} Access token or null
 */
const getAccessTokenFromCookie = (req) => {
  return req.cookies[COOKIE_CONFIG.accessToken.name] || null;
};

/**
 * Get refresh token from cookies
 * @param {Object} req - Express request object
 * @returns {String|null} Refresh token or null
 */
const getRefreshTokenFromCookie = (req) => {
  return req.cookies[COOKIE_CONFIG.refreshToken.name] || null;
};

/**
 * Get user data from cookies
 * @param {Object} req - Express request object
 * @returns {Object|null} User data or null
 */
const getUserDataFromCookie = (req) => {
  try {
    const userDataStr = req.cookies[COOKIE_CONFIG.userData.name];
    if (!userDataStr) return null;
    return JSON.parse(userDataStr);
  } catch (error) {
    logger.error('Error parsing user data from cookie', error);
    return null;
  }
};

/**
 * Update user data cookie
 * @param {Object} res - Express response object
 * @param {Object} user - Updated user data
 */
const updateUserDataCookie = (res, user) => {
  try {
    const safeUserData = {
      id: user._id || user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      profile: user.profile,
      isActive: user.isActive,
      isVerified: user.isVerified
    };

    res.cookie(COOKIE_CONFIG.userData.name, JSON.stringify(safeUserData), {
      httpOnly: COOKIE_CONFIG.userData.httpOnly,
      secure: COOKIE_CONFIG.userData.secure,
      sameSite: COOKIE_CONFIG.userData.sameSite,
      maxAge: COOKIE_CONFIG.userData.maxAge,
      path: COOKIE_CONFIG.userData.path
    });

    logger.info('User data cookie updated', { userId: user._id || user.id });
  } catch (error) {
    logger.error('Error updating user data cookie', error);
    throw error;
  }
};

module.exports = {
  setAuthCookies,
  clearAuthCookies,
  getAccessTokenFromCookie,
  getRefreshTokenFromCookie,
  getUserDataFromCookie,
  updateUserDataCookie,
  COOKIE_CONFIG
};
