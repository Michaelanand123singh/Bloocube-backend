// src/utils/constants.js

// User roles
const USER_ROLES = {
  CREATOR: 'creator',
  BRAND: 'brand',
  ADMIN: 'admin'
};

// Campaign statuses
const CAMPAIGN_STATUS = {
  DRAFT: 'draft',
  ACTIVE: 'active',
  CLOSED: 'closed',
  COMPLETED: 'completed',
  CANCELLED: 'cancelled'
};

// Bid statuses
const BID_STATUS = {
  PENDING: 'pending',
  ACCEPTED: 'accepted',
  REJECTED: 'rejected',
  WITHDRAWN: 'withdrawn',
  COMPLETED: 'completed'
};

// AI result types
const AI_RESULT_TYPES = {
  SUGGESTION: 'suggestion',
  ANALYSIS: 'analysis',
  MATCHMAKING: 'matchmaking',
  COMPETITOR_ANALYSIS: 'competitor_analysis',
  CONTENT_OPTIMIZATION: 'content_optimization',
  TREND_ANALYSIS: 'trend_analysis'
};

// Social media platforms
const PLATFORMS = {
  INSTAGRAM: 'instagram',
  YOUTUBE: 'youtube',
  TWITTER: 'twitter',
  LINKEDIN: 'linkedin',
  FACEBOOK: 'facebook'
};

// Content types
const CONTENT_TYPES = {
  POST: 'post',
  STORY: 'story',
  REEL: 'reel',
  VIDEO: 'video',
  LIVE: 'live',
  CAROUSEL: 'carousel',
  POLL: 'poll'
};

// Post types for analytics
const POST_TYPES = {
  POST: 'post',
  STORY: 'story',
  REEL: 'reel',
  VIDEO: 'video',
  LIVE: 'live',
  CAROUSEL: 'carousel',
  POLL: 'poll'
};

// Media types
const MEDIA_TYPES = {
  IMAGE: 'image',
  VIDEO: 'video',
  CAROUSEL: 'carousel',
  TEXT: 'text'
};

// Payment types
const PAYMENT_TYPES = {
  FIXED: 'fixed',
  PERFORMANCE: 'performance'
};

// Payment schedules
const PAYMENT_SCHEDULES = {
  UPFRONT: 'upfront',
  MILESTONE: 'milestone',
  COMPLETION: 'completion'
};

// Communication methods
const COMMUNICATION_METHODS = {
  EMAIL: 'email',
  PHONE: 'phone',
  WHATSAPP: 'whatsapp',
  TELEGRAM: 'telegram'
};

// Currencies
const CURRENCIES = {
  INR: 'INR',
  USD: 'USD',
  EUR: 'EUR'
};

// Content tones
const CONTENT_TONES = {
  PROFESSIONAL: 'professional',
  CASUAL: 'casual',
  HUMOROUS: 'humorous',
  INSPIRATIONAL: 'inspirational',
  EDUCATIONAL: 'educational'
};

// Priority levels
const PRIORITY_LEVELS = {
  LOW: 'low',
  MEDIUM: 'medium',
  HIGH: 'high',
  CRITICAL: 'critical'
};

// Impact levels
const IMPACT_LEVELS = {
  LOW: 'low',
  MEDIUM: 'medium',
  HIGH: 'high'
};

// Risk levels
const RISK_LEVELS = {
  LOW: 'low',
  MEDIUM: 'medium',
  HIGH: 'high'
};

// Competition levels
const COMPETITION_LEVELS = {
  LOW: 'low',
  MEDIUM: 'medium',
  HIGH: 'high'
};

// Difficulty levels
const DIFFICULTY_LEVELS = {
  EASY: 'easy',
  MEDIUM: 'medium',
  HARD: 'hard'
};

// AI result statuses
const AI_RESULT_STATUS = {
  PROCESSING: 'processing',
  COMPLETED: 'completed',
  FAILED: 'failed',
  EXPIRED: 'expired'
};

// Analytics data sources
const DATA_SOURCES = {
  API: 'api',
  MANUAL: 'manual',
  SCRAPED: 'scraped',
  IMPORTED: 'imported'
};

// HTTP status codes
const HTTP_STATUS = {
  OK: 200,
  CREATED: 201,
  NO_CONTENT: 204,
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  UNPROCESSABLE_ENTITY: 422,
  TOO_MANY_REQUESTS: 429,
  INTERNAL_SERVER_ERROR: 500,
  BAD_GATEWAY: 502,
  SERVICE_UNAVAILABLE: 503
};

// Error codes
const ERROR_CODES = {
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  AUTHENTICATION_ERROR: 'AUTHENTICATION_ERROR',
  AUTHORIZATION_ERROR: 'AUTHORIZATION_ERROR',
  NOT_FOUND: 'NOT_FOUND',
  CONFLICT: 'CONFLICT',
  RATE_LIMIT_EXCEEDED: 'RATE_LIMIT_EXCEEDED',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
  EXTERNAL_SERVICE_ERROR: 'EXTERNAL_SERVICE_ERROR'
};

// Success messages
const SUCCESS_MESSAGES = {
  USER_CREATED: 'User created successfully',
  USER_UPDATED: 'User updated successfully',
  USER_DELETED: 'User deleted successfully',
  LOGIN_SUCCESS: 'Login successful',
  LOGOUT_SUCCESS: 'Logout successful',
  PASSWORD_RESET_SENT: 'Password reset email sent',
  PASSWORD_RESET_SUCCESS: 'Password reset successful',
  CAMPAIGN_CREATED: 'Campaign created successfully',
  CAMPAIGN_UPDATED: 'Campaign updated successfully',
  CAMPAIGN_DELETED: 'Campaign deleted successfully',
  BID_CREATED: 'Bid created successfully',
  BID_UPDATED: 'Bid updated successfully',
  BID_ACCEPTED: 'Bid accepted successfully',
  BID_REJECTED: 'Bid rejected successfully',
  ANALYTICS_CREATED: 'Analytics data created successfully',
  AI_RESULT_GENERATED: 'AI result generated successfully'
};

// Error messages
const ERROR_MESSAGES = {
  INVALID_CREDENTIALS: 'Invalid email or password',
  USER_NOT_FOUND: 'User not found',
  USER_ALREADY_EXISTS: 'User already exists',
  INVALID_TOKEN: 'Invalid or expired token',
  ACCESS_DENIED: 'Access denied',
  CAMPAIGN_NOT_FOUND: 'Campaign not found',
  BID_NOT_FOUND: 'Bid not found',
  INSUFFICIENT_PERMISSIONS: 'Insufficient permissions',
  VALIDATION_FAILED: 'Validation failed',
  RATE_LIMIT_EXCEEDED: 'Rate limit exceeded',
  INTERNAL_ERROR: 'Internal server error',
  EXTERNAL_SERVICE_ERROR: 'External service error'
};

// Pagination defaults
const PAGINATION = {
  DEFAULT_PAGE: 1,
  DEFAULT_LIMIT: 10,
  MAX_LIMIT: 100
};

// Cache keys
const CACHE_KEYS = {
  USER_PROFILE: (userId) => `user:profile:${userId}`,
  CAMPAIGN_DETAILS: (campaignId) => `campaign:details:${campaignId}`,
  USER_ANALYTICS: (userId) => `user:analytics:${userId}`,
  AI_RESULTS: (userId, type) => `ai:results:${userId}:${type}`,
  RATE_LIMIT: (ip) => `rate_limit:${ip}`,
  SESSION: (userId) => `session:${userId}`
};

// Cache TTL (Time To Live) in seconds
const CACHE_TTL = {
  USER_PROFILE: 3600, // 1 hour
  CAMPAIGN_DETAILS: 1800, // 30 minutes
  USER_ANALYTICS: 7200, // 2 hours
  AI_RESULTS: 86400, // 24 hours
  RATE_LIMIT: 900, // 15 minutes
  SESSION: 2592000 // 30 days
};

// File upload limits
const FILE_LIMITS = {
  MAX_FILE_SIZE: 10 * 1024 * 1024, // 10MB
  ALLOWED_IMAGE_TYPES: ['image/jpeg', 'image/png', 'image/gif', 'image/webp'],
  ALLOWED_VIDEO_TYPES: ['video/mp4', 'video/avi', 'video/mov', 'video/wmv'],
  MAX_FILES_PER_REQUEST: 5
};

// Social media API limits
const API_LIMITS = {
  INSTAGRAM_DAILY_LIMIT: 200,
  YOUTUBE_DAILY_LIMIT: 10000,
  TWITTER_DAILY_LIMIT: 300,
  LINKEDIN_DAILY_LIMIT: 100,
  FACEBOOK_DAILY_LIMIT: 200
};

// Analytics intervals
const ANALYTICS_INTERVALS = {
  HOURLY: 'hourly',
  DAILY: 'daily',
  WEEKLY: 'weekly',
  MONTHLY: 'monthly'
};

// Notification types
const NOTIFICATION_TYPES = {
  CAMPAIGN_CREATED: 'campaign_created',
  BID_RECEIVED: 'bid_received',
  BID_ACCEPTED: 'bid_accepted',
  BID_REJECTED: 'bid_rejected',
  CAMPAIGN_DEADLINE: 'campaign_deadline',
  PAYMENT_RECEIVED: 'payment_received',
  ANALYTICS_UPDATE: 'analytics_update',
  AI_SUGGESTION: 'ai_suggestion'
};

// Email templates
const EMAIL_TEMPLATES = {
  WELCOME: 'welcome',
  PASSWORD_RESET: 'password_reset',
  BID_NOTIFICATION: 'bid_notification',
  CAMPAIGN_UPDATE: 'campaign_update',
  PAYMENT_CONFIRMATION: 'payment_confirmation'
};

// Cron job schedules
const CRON_SCHEDULES = {
  ANALYTICS_SYNC: '0 */6 * * *', // Every 6 hours
  CLEANUP_EXPIRED_TOKENS: '0 0 * * *', // Daily at midnight
  SEND_NOTIFICATIONS: '0 9 * * *', // Daily at 9 AM
  BACKUP_DATABASE: '0 2 * * 0', // Weekly on Sunday at 2 AM
  // Process scheduled posts every minute
  SCHEDULED_POSTS_PROCESSOR: '* * * * *'
};

module.exports = {
  USER_ROLES,
  CAMPAIGN_STATUS,
  BID_STATUS,
  AI_RESULT_TYPES,
  PLATFORMS,
  CONTENT_TYPES,
  POST_TYPES,
  MEDIA_TYPES,
  PAYMENT_TYPES,
  PAYMENT_SCHEDULES,
  COMMUNICATION_METHODS,
  CURRENCIES,
  CONTENT_TONES,
  PRIORITY_LEVELS,
  IMPACT_LEVELS,
  RISK_LEVELS,
  COMPETITION_LEVELS,
  DIFFICULTY_LEVELS,
  AI_RESULT_STATUS,
  DATA_SOURCES,
  HTTP_STATUS,
  ERROR_CODES,
  SUCCESS_MESSAGES,
  ERROR_MESSAGES,
  PAGINATION,
  CACHE_KEYS,
  CACHE_TTL,
  FILE_LIMITS,
  API_LIMITS,
  ANALYTICS_INTERVALS,
  NOTIFICATION_TYPES,
  EMAIL_TEMPLATES,
  CRON_SCHEDULES
};
