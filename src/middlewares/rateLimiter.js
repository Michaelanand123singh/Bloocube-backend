// src/middlewares/rateLimiter.js
const rateLimit = require('express-rate-limit');
const redis = require('../config/redis');
const logger = require('../utils/logger');
const { HTTP_STATUS, ERROR_CODES } = require('../utils/constants');

/**
 * Redis-based rate limiter
 */
const createRedisRateLimit = (options = {}) => {
  const {
    windowMs = 15 * 60 * 1000, // 15 minutes
    max = 100, // limit each IP to 100 requests per windowMs
    message = 'Too many requests from this IP',
    skipSuccessfulRequests = false,
    skipFailedRequests = false,
    keyGenerator = (req) => req.ip,
    skip = (req) => false
  } = options;

  return async (req, res, next) => {
    try {
      // Skip if condition is met
      if (skip(req)) {
        return next();
      }

      const key = `rate_limit:${keyGenerator(req)}`;
      const now = Date.now();
      const window = Math.floor(now / windowMs);

      // Get current count from Redis
      const currentCount = await redis.get(`${key}:${window}`);
      const count = currentCount ? parseInt(currentCount) : 0;

      if (count >= max) {
        logger.warn('Rate limit exceeded', {
          ip: req.ip,
          key,
          count,
          max,
          windowMs
        });

        return res.status(HTTP_STATUS.TOO_MANY_REQUESTS).json({
          success: false,
          message,
          code: ERROR_CODES.RATE_LIMIT_EXCEEDED,
          retryAfter: Math.ceil(windowMs / 1000)
        });
      }

      // Increment counter
      await redis.set(`${key}:${window}`, count + 1, Math.ceil(windowMs / 1000));

      // Add rate limit headers
      res.set({
        'X-RateLimit-Limit': max,
        'X-RateLimit-Remaining': Math.max(0, max - count - 1),
        'X-RateLimit-Reset': new Date(now + windowMs).toISOString()
      });

      next();
    } catch (error) {
      logger.error('Rate limiter error', error);
      // Continue without rate limiting if Redis fails
      next();
    }
  };
};

/**
 * Memory-based rate limiter for development
 */
const createMemoryRateLimit = (options = {}) => {
  const {
    windowMs = 15 * 60 * 1000,
    max = 100,
    message = 'Too many requests from this IP',
    skipSuccessfulRequests = false,
    skipFailedRequests = false,
    keyGenerator = (req) => req.ip,
    skip = (req) => false
  } = options;

  const requests = new Map();

  return (req, res, next) => {
    if (skip(req)) {
      return next();
    }

    const key = keyGenerator(req);
    const now = Date.now();
    const window = Math.floor(now / windowMs);

    // Clean up old entries
    for (const [k, v] of requests.entries()) {
      if (v.window < window) {
        requests.delete(k);
      }
    }

    // Get or create entry for this key
    let entry = requests.get(key);
    if (!entry || entry.window < window) {
      entry = { window, count: 0 };
      requests.set(key, entry);
    }

    if (entry.count >= max) {
      logger.warn('Rate limit exceeded (memory)', {
        ip: req.ip,
        key,
        count: entry.count,
        max,
        windowMs
      });

      return res.status(HTTP_STATUS.TOO_MANY_REQUESTS).json({
        success: false,
        message,
        code: ERROR_CODES.RATE_LIMIT_EXCEEDED,
        retryAfter: Math.ceil(windowMs / 1000)
      });
    }

    entry.count++;

    // Add rate limit headers
    res.set({
      'X-RateLimit-Limit': max,
      'X-RateLimit-Remaining': Math.max(0, max - entry.count),
      'X-RateLimit-Reset': new Date(now + windowMs).toISOString()
    });

    next();
  };
};

/**
 * Create rate limiter based on environment
 */
const createRateLimit = (options = {}) => {
  if (process.env.NODE_ENV === 'production' && redis.isConnected) {
    return createRedisRateLimit(options);
  }
  return createMemoryRateLimit(options);
};

/**
 * General API rate limiter
 */
const generalLimiter = createRateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  message: 'Too many requests from this IP, please try again later',
  standardHeaders: true,
  legacyHeaders: false
});

/**
 * Strict rate limiter for authentication endpoints
 */
const authLimiter = createRateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // limit each IP to 5 requests per windowMs
  message: 'Too many authentication attempts, please try again later',
  skipSuccessfulRequests: true,
  standardHeaders: true,
  legacyHeaders: false
});

/**
 * Password reset rate limiter
 */
const passwordResetLimiter = createRateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 3, // limit each IP to 3 password reset requests per hour
  message: 'Too many password reset attempts, please try again later',
  standardHeaders: true,
  legacyHeaders: false
});

/**
 * File upload rate limiter
 */
const uploadLimiter = createRateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 20, // limit each IP to 20 uploads per hour
  message: 'Too many file uploads, please try again later',
  standardHeaders: true,
  legacyHeaders: false
});

/**
 * AI service rate limiter
 */
const aiServiceLimiter = createRateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 50, // limit each IP to 50 AI requests per hour
  message: 'Too many AI service requests, please try again later',
  standardHeaders: true,
  legacyHeaders: false
});

/**
 * Campaign creation rate limiter
 */
const campaignLimiter = createRateLimit({
  windowMs: 24 * 60 * 60 * 1000, // 24 hours
  max: 10, // limit each IP to 10 campaigns per day
  message: 'Campaign creation limit reached, please try again tomorrow',
  standardHeaders: true,
  legacyHeaders: false
});

/**
 * Bid submission rate limiter
 */
const bidLimiter = createRateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 20, // limit each IP to 20 bids per hour
  message: 'Too many bid submissions, please try again later',
  standardHeaders: true,
  legacyHeaders: false
});

/**
 * User-specific rate limiter
 */
const userSpecificLimiter = (options = {}) => {
  const {
    windowMs = 15 * 60 * 1000,
    max = 100,
    message = 'Too many requests from this user'
  } = options;

  return createRateLimit({
    windowMs,
    max,
    message,
    keyGenerator: (req) => req.userId ? `user:${req.userId}` : req.ip,
    skip: (req) => !req.userId
  });
};

/**
 * Admin rate limiter (more lenient)
 */
const adminLimiter = createRateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 1000, // higher limit for admin users
  message: 'Admin rate limit exceeded',
  skip: (req) => req.user?.role !== 'admin',
  standardHeaders: true,
  legacyHeaders: false
});

/**
 * Dynamic rate limiter based on user role
 */
const dynamicLimiter = (req, res, next) => {
  if (req.user?.role === 'admin') {
    return adminLimiter(req, res, next);
  } else if (req.user?.role === 'brand') {
    return campaignLimiter(req, res, next);
  } else if (req.user?.role === 'creator') {
    return bidLimiter(req, res, next);
  } else {
    return generalLimiter(req, res, next);
  }
};

module.exports = {
  createRateLimit,
  generalLimiter,
  authLimiter,
  passwordResetLimiter,
  uploadLimiter,
  aiServiceLimiter,
  campaignLimiter,
  bidLimiter,
  userSpecificLimiter,
  adminLimiter,
  dynamicLimiter
};
