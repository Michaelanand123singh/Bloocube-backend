// src/utils/retryLogic.js
const logger = require('./logger');

/**
 * Retry configuration for different platforms
 */
const RETRY_CONFIG = {
  twitter: {
    maxRetries: 3,
    baseDelay: 1000, // 1 second
    maxDelay: 30000, // 30 seconds
    retryableErrors: [
      'rate_limit_exceeded',
      'temporarily_unavailable',
      'service_unavailable',
      'internal_server_error',
      'bad_gateway',
      'gateway_timeout'
    ]
  },
  linkedin: {
    maxRetries: 3,
    baseDelay: 2000, // 2 seconds
    maxDelay: 60000, // 1 minute
    retryableErrors: [
      'rate_limit_exceeded',
      'temporarily_unavailable',
      'service_unavailable',
      'internal_server_error'
    ]
  },
  instagram: {
    maxRetries: 2,
    baseDelay: 5000, // 5 seconds
    maxDelay: 30000, // 30 seconds
    retryableErrors: [
      'rate_limit_exceeded',
      'temporarily_unavailable',
      'service_unavailable'
    ]
  },
  youtube: {
    maxRetries: 2,
    baseDelay: 10000, // 10 seconds
    maxDelay: 120000, // 2 minutes
    retryableErrors: [
      'quota_exceeded',
      'rate_limit_exceeded',
      'service_unavailable',
      'internal_server_error'
    ]
  },
  facebook: {
    maxRetries: 3,
    baseDelay: 2000, // 2 seconds
    maxDelay: 60000, // 1 minute
    retryableErrors: [
      'rate_limit_exceeded',
      'temporarily_unavailable',
      'service_unavailable',
      'internal_server_error'
    ]
  }
};

/**
 * Check if an error is retryable
 * @param {Error|Object} error - Error object
 * @param {string} platform - Platform name
 * @returns {boolean} Whether the error is retryable
 */
function isRetryableError(error, platform) {
  const config = RETRY_CONFIG[platform];
  if (!config) return false;

  const errorMessage = error.message?.toLowerCase() || '';
  const errorCode = error.code?.toLowerCase() || '';
  const statusCode = error.status || error.statusCode;

  // Check for retryable error messages/codes
  const isRetryableMessage = config.retryableErrors.some(retryableError => 
    errorMessage.includes(retryableError) || errorCode.includes(retryableError)
  );

  // Check for retryable HTTP status codes
  const retryableStatusCodes = [429, 500, 502, 503, 504];
  const isRetryableStatus = retryableStatusCodes.includes(statusCode);

  return isRetryableMessage || isRetryableStatus;
}

/**
 * Calculate delay for exponential backoff
 * @param {number} attempt - Current attempt number (0-based)
 * @param {string} platform - Platform name
 * @returns {number} Delay in milliseconds
 */
function calculateDelay(attempt, platform) {
  const config = RETRY_CONFIG[platform];
  if (!config) return 1000;

  const delay = config.baseDelay * Math.pow(2, attempt);
  const jitter = Math.random() * 1000; // Add jitter to prevent thundering herd
  
  return Math.min(delay + jitter, config.maxDelay);
}

/**
 * Sleep for specified milliseconds
 * @param {number} ms - Milliseconds to sleep
 * @returns {Promise} Promise that resolves after delay
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Retry a function with exponential backoff
 * @param {Function} fn - Function to retry
 * @param {string} platform - Platform name
 * @param {Object} context - Additional context for logging
 * @returns {Promise} Result of the function
 */
async function retryWithBackoff(fn, platform, context = {}) {
  const config = RETRY_CONFIG[platform];
  if (!config) {
    throw new Error(`No retry configuration found for platform: ${platform}`);
  }

  let lastError;
  
  for (let attempt = 0; attempt <= config.maxRetries; attempt++) {
    try {
      logger.info(`Attempting ${platform} operation`, {
        attempt: attempt + 1,
        maxRetries: config.maxRetries + 1,
        ...context
      });

      const result = await fn();
      
      if (attempt > 0) {
        logger.info(`${platform} operation succeeded after retry`, {
          attempt: attempt + 1,
          ...context
        });
      }
      
      return result;
    } catch (error) {
      lastError = error;
      
      // Check if this is the last attempt
      if (attempt === config.maxRetries) {
        logger.error(`${platform} operation failed after all retries`, {
          attempts: attempt + 1,
          error: error.message,
          ...context
        });
        break;
      }

      // Check if error is retryable
      if (!isRetryableError(error, platform)) {
        logger.warn(`${platform} operation failed with non-retryable error`, {
          attempt: attempt + 1,
          error: error.message,
          ...context
        });
        break;
      }

      // Calculate delay and wait
      const delay = calculateDelay(attempt, platform);
      logger.warn(`${platform} operation failed, retrying`, {
        attempt: attempt + 1,
        error: error.message,
        retryIn: `${delay}ms`,
        ...context
      });

      await sleep(delay);
    }
  }

  // If we get here, all retries failed
  throw lastError;
}

/**
 * Retry posting to a platform
 * @param {Function} postFunction - Function that posts to platform
 * @param {string} platform - Platform name
 * @param {Object} postData - Post data for context
 * @returns {Promise} Posting result
 */
async function retryPost(postFunction, platform, postData = {}) {
  const context = {
    postId: postData._id,
    userId: postData.author,
    platform: postData.platform
  };

  return retryWithBackoff(postFunction, platform, context);
}

/**
 * Update post with retry information
 * @param {Object} post - Post document
 * @param {Object} result - Posting result
 * @param {number} attempt - Attempt number
 * @returns {Promise} Updated post
 */
async function updatePostWithRetryInfo(post, result, attempt = 1) {
  if (result.success) {
    post.status = 'published';
    post.publishing = {
      ...post.publishing,
      published_at: new Date(),
      platform_post_id: result.tweet_id || result.thread_id || result.video_id || result.post_id || null,
      platform_url: result.url || null,
      retry_count: attempt - 1
    };
  } else {
    post.status = 'failed';
    post.publishing = {
      ...post.publishing,
      published_at: new Date(),
      error: result.error,
      retry_count: attempt
    };
  }

  return post.save();
}

module.exports = {
  retryWithBackoff,
  retryPost,
  updatePostWithRetryInfo,
  isRetryableError,
  calculateDelay,
  RETRY_CONFIG
};
