// src/utils/urlUtils.js
const config = require('../config/env');

/**
 * Get the frontend URL based on environment
 * @returns {string} Frontend URL
 */
const getFrontendUrl = () => {
  // Check if FRONTEND_URL is explicitly set
  if (process.env.FRONTEND_URL) {
    return process.env.FRONTEND_URL;
  }
  
  // Fallback based on environment
  if (process.env.NODE_ENV === 'production') {
    return 'https://bloocube.com';
  }
  return 'http://localhost:3000';
};

/**
 * Get the backend URL based on environment
 * @returns {string} Backend URL
 */
const getBackendUrl = () => {
  // Check if BASE_URL is explicitly set
  if (process.env.BASE_URL) {
    return process.env.BASE_URL;
  }
  
  // Fallback based on environment
  if (process.env.NODE_ENV === 'production') {
    return 'https://api-backend.bloocube.com';
  }
  return `http://localhost:${config.PORT || 5000}`;
};

/**
 * Get OAuth callback URL for a specific platform
 * @param {string} platform - OAuth platform (google, facebook, linkedin, twitter, instagram, youtube)
 * @returns {string} Callback URL
 */
const getCallbackUrl = (platform) => {
  const frontendUrl = getFrontendUrl();
  return `${frontendUrl}/auth/${platform}/callback`;
};

/**
 * Get backend callback URL for a specific platform
 * @param {string} platform - OAuth platform
 * @returns {string} Backend callback URL
 */
const getBackendCallbackUrl = (platform) => {
  const backendUrl = getBackendUrl();
  return `${backendUrl}/api/${platform}/callback`;
};

/**
 * Get redirect URL for creator settings
 * @returns {string} Creator settings URL
 */
const getCreatorSettingsUrl = () => {
  const frontendUrl = getFrontendUrl();
  return `${frontendUrl}/creator/settings`;
};

/**
 * Get redirect URL for login page
 * @returns {string} Login URL
 */
const getLoginUrl = () => {
  const frontendUrl = getFrontendUrl();
  return `${frontendUrl}/login`;
};

/**
 * Get redirect URL for dashboard
 * @returns {string} Dashboard URL
 */
const getDashboardUrl = () => {
  const frontendUrl = getFrontendUrl();
  return `${frontendUrl}/creator/dashboard`;
};

/**
 * Build redirect URL with query parameters
 * @param {string} baseUrl - Base URL
 * @param {Object} params - Query parameters
 * @returns {string} URL with query parameters
 */
const buildRedirectUrl = (baseUrl, params = {}) => {
  const url = new URL(baseUrl);
  Object.entries(params).forEach(([key, value]) => {
    if (value !== null && value !== undefined) {
      url.searchParams.set(key, value);
    }
  });
  return url.toString();
};

/**
 * Get CORS origins based on environment
 * @returns {string} CORS origins
 */
const getCorsOrigins = () => {
  // Check if CORS_ORIGIN is explicitly set
  if (process.env.CORS_ORIGIN) {
    return process.env.CORS_ORIGIN;
  }
  
  // Fallback based on environment
  if (process.env.NODE_ENV === 'production') {
    return 'https://bloocube.com,https://admin.bloocube.com,https://api-backend.bloocube.com,https://api-ai-services.bloocube.com';
  }
  return 'http://localhost:3000,https://bloocube.com,https://admin.bloocube.com,https://api-backend.bloocube.com,https://api-ai-services.bloocube.com';
};

module.exports = {
  getFrontendUrl,
  getBackendUrl,
  getCallbackUrl,
  getBackendCallbackUrl,
  getCreatorSettingsUrl,
  getLoginUrl,
  getDashboardUrl,
  buildRedirectUrl,
  getCorsOrigins
};
