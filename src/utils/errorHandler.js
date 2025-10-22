// src/utils/standardErrorHandler.js
const logger = require('./logger');

/**
 * Standard error response format
 */
class StandardError extends Error {
  constructor(message, code, statusCode = 500, details = null) {
    super(message);
    this.name = 'StandardError';
    this.code = code;
    this.statusCode = statusCode;
    this.details = details;
    this.timestamp = new Date().toISOString();
  }
}

/**
 * Platform-specific error codes
 */
const ERROR_CODES = {
  // Authentication errors
  AUTH_REQUIRED: 'AUTH_REQUIRED',
  AUTH_INVALID: 'AUTH_INVALID',
  AUTH_EXPIRED: 'AUTH_EXPIRED',
  
  // Platform connection errors
  PLATFORM_NOT_CONNECTED: 'PLATFORM_NOT_CONNECTED',
  PLATFORM_TOKEN_INVALID: 'PLATFORM_TOKEN_INVALID',
  PLATFORM_TOKEN_EXPIRED: 'PLATFORM_TOKEN_EXPIRED',
  
  // Content validation errors
  CONTENT_TOO_LONG: 'CONTENT_TOO_LONG',
  CONTENT_TOO_SHORT: 'CONTENT_TOO_SHORT',
  CONTENT_INVALID: 'CONTENT_INVALID',
  MEDIA_INVALID: 'MEDIA_INVALID',
  MEDIA_TOO_LARGE: 'MEDIA_TOO_LARGE',
  MEDIA_UNSUPPORTED: 'MEDIA_UNSUPPORTED',
  
  // Rate limiting errors
  RATE_LIMIT_EXCEEDED: 'RATE_LIMIT_EXCEEDED',
  QUOTA_EXCEEDED: 'QUOTA_EXCEEDED',
  
  // Network errors
  NETWORK_ERROR: 'NETWORK_ERROR',
  TIMEOUT_ERROR: 'TIMEOUT_ERROR',
  SERVICE_UNAVAILABLE: 'SERVICE_UNAVAILABLE',
  
  // General errors
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
  EXTERNAL_SERVICE_ERROR: 'EXTERNAL_SERVICE_ERROR',
  UNSUPPORTED_PLATFORM: 'UNSUPPORTED_PLATFORM'
};

/**
 * Create standardized error response
 * @param {string} message - Error message
 * @param {string} code - Error code
 * @param {number} statusCode - HTTP status code
 * @param {Object} details - Additional error details
 * @returns {Object} Standardized error response
 */
function createErrorResponse(message, code, statusCode = 500, details = null) {
  return {
    success: false,
    error: {
      message,
      code,
      statusCode,
      timestamp: new Date().toISOString(),
      details
    }
  };
}

/**
 * Handle platform-specific errors
 * @param {Error} error - Original error
 * @param {string} platform - Platform name
 * @returns {Object} Standardized error response
 */
function handlePlatformError(error, platform) {
  const errorMessage = error.message?.toLowerCase() || '';
  const statusCode = error.status || error.statusCode || 500;
  
  // Rate limiting errors
  if (errorMessage.includes('rate_limit') || errorMessage.includes('quota_exceeded') || statusCode === 429) {
    return createErrorResponse(
      `${platform} rate limit exceeded. Please try again later.`,
      ERROR_CODES.RATE_LIMIT_EXCEEDED,
      429,
      { platform, retryAfter: error.retryAfter }
    );
  }
  
  // Authentication errors
  if (errorMessage.includes('unauthorized') || errorMessage.includes('invalid_token') || statusCode === 401) {
    return createErrorResponse(
      `${platform} authentication failed. Please reconnect your account.`,
      ERROR_CODES.PLATFORM_TOKEN_INVALID,
      401,
      { platform }
    );
  }
  
  // Token expired errors
  if (errorMessage.includes('expired') || errorMessage.includes('token_expired')) {
    return createErrorResponse(
      `${platform} token expired. Please reconnect your account.`,
      ERROR_CODES.PLATFORM_TOKEN_EXPIRED,
      401,
      { platform }
    );
  }
  
  // Content validation errors
  if (errorMessage.includes('too long') || errorMessage.includes('exceeds limit')) {
    return createErrorResponse(
      `Content exceeds ${platform} character limit.`,
      ERROR_CODES.CONTENT_TOO_LONG,
      400,
      { platform, maxLength: getPlatformMaxLength(platform) }
    );
  }
  
  // Media errors
  if (errorMessage.includes('media') || errorMessage.includes('file')) {
    return createErrorResponse(
      `Invalid media file for ${platform}.`,
      ERROR_CODES.MEDIA_INVALID,
      400,
      { platform }
    );
  }
  
  // Network errors
  if (errorMessage.includes('network') || errorMessage.includes('timeout') || statusCode >= 500) {
    return createErrorResponse(
      `${platform} service temporarily unavailable. Please try again later.`,
      ERROR_CODES.SERVICE_UNAVAILABLE,
      503,
      { platform }
    );
  }
  
  // Default error
  return createErrorResponse(
    `Failed to post to ${platform}: ${error.message}`,
    ERROR_CODES.EXTERNAL_SERVICE_ERROR,
    statusCode,
    { platform, originalError: errorMessage }
  );
}

/**
 * Get platform-specific character limits
 * @param {string} platform - Platform name
 * @returns {number} Character limit
 */
function getPlatformMaxLength(platform) {
  const limits = {
    twitter: 280,
    linkedin: 3000,
    instagram: 2200,
    youtube: 5000,
    facebook: 63206
  };
  return limits[platform] || 1000;
}

/**
 * Handle validation errors
 * @param {Array} errors - Validation errors
 * @returns {Object} Standardized error response
 */
function handleValidationError(errors) {
  return createErrorResponse(
    'Validation failed',
    ERROR_CODES.VALIDATION_ERROR,
    400,
    { validationErrors: errors }
  );
}

/**
 * Handle internal server errors
 * @param {Error} error - Original error
 * @returns {Object} Standardized error response
 */
function handleInternalError(error) {
  logger.error('Internal server error:', error);
  
  return createErrorResponse(
    'An internal server error occurred',
    ERROR_CODES.INTERNAL_ERROR,
    500,
    process.env.NODE_ENV === 'development' ? { stack: error.stack } : null
  );
}

/**
 * Middleware to standardize error responses
 * @param {Error} error - Error object
 * @param {Object} req - Request object
 * @param {Object} res - Response object
 * @param {Function} next - Next function
 */
function errorHandler(error, req, res, next) {
  let errorResponse;
  
  if (error instanceof StandardError) {
    errorResponse = createErrorResponse(error.message, error.code, error.statusCode, error.details);
  } else if (error.name === 'ValidationError') {
    errorResponse = handleValidationError([error.message]);
  } else if (error.name === 'CastError') {
    errorResponse = createErrorResponse('Invalid ID format', ERROR_CODES.VALIDATION_ERROR, 400);
  } else {
    errorResponse = handleInternalError(error);
  }
  
  res.status(errorResponse.error.statusCode).json(errorResponse);
}

/**
 * Async error wrapper for route handlers
 * @param {Function} fn - Async function
 * @returns {Function} Wrapped function
 */
function asyncErrorHandler(fn) {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

module.exports = {
  StandardError,
  ERROR_CODES,
  createErrorResponse,
  handlePlatformError,
  handleValidationError,
  handleInternalError,
  errorHandler,
  asyncErrorHandler
};
