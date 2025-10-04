// src/config/env.js
require('dotenv').config();

const config = {
  // Server Configuration
  NODE_ENV: process.env.NODE_ENV || 'development',
  PORT: parseInt(process.env.PORT, 10) || 5000,
  
  // Database Configuration
  MONGODB_URI: process.env.MONGODB_URI,
  
  // Redis Configuration
  REDIS_URL: process.env.REDIS_URL || 'redis://localhost:6379',
  

  // JWT Configuration
  JWT_SECRET: process.env.JWT_SECRET,
  JWT_EXPIRE: process.env.JWT_EXPIRE || '7d',
  JWT_REFRESH_SECRET: process.env.JWT_REFRESH_SECRET,
  JWT_REFRESH_EXPIRE: process.env.JWT_REFRESH_EXPIRE || '30d',
  
  // Email Configuration
  EMAIL_HOST: process.env.EMAIL_HOST || 'smtp.gmail.com',
  EMAIL_PORT: process.env.EMAIL_PORT || 587,
  EMAIL_USER: process.env.EMAIL_USER,
  EMAIL_PASS: process.env.EMAIL_PASS,
  EMAIL_FROM: process.env.EMAIL_FROM || 'noreply@bloocube.com',
  
  // Social Media API Keys
  INSTAGRAM_CLIENT_ID: process.env.INSTAGRAM_CLIENT_ID,
  INSTAGRAM_CLIENT_SECRET: process.env.INSTAGRAM_CLIENT_SECRET,
  FACEBOOK_APP_ID: process.env.FACEBOOK_APP_ID,
  FACEBOOK_APP_SECRET: process.env.FACEBOOK_APP_SECRET,
  TWITTER_CLIENT_ID: process.env.TWITTER_CLIENT_ID,
  TWITTER_CLIENT_SECRET: process.env.TWITTER_CLIENT_SECRET,
  LINKEDIN_CLIENT_ID: process.env.LINKEDIN_CLIENT_ID,
  LINKEDIN_CLIENT_SECRET: process.env.LINKEDIN_CLIENT_SECRET,
  LINKEDIN_SCOPES: process.env.LINKEDIN_SCOPES || 'r_liteprofile,r_emailaddress',
  
  // Google OAuth
  GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID,
  GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET,
  GOOGLE_SCOPES: process.env.GOOGLE_SCOPES || 'openid email profile',
  YOUTUBE_CLIENT_ID: process.env.YOUTUBE_CLIENT_ID,
  YOUTUBE_CLIENT_SECRET: process.env.YOUTUBE_CLIENT_SECRET,
  
  // Twitter OAuth
  TWITTER_SCOPES: process.env.TWITTER_SCOPES || 'tweet.read users.read offline.access',
  
  // AI Service Configuration (Updated for stateless flow)
  AI_SERVICE_URL: process.env.AI_SERVICE_URL || 'http://localhost:8001',
  AI_SERVICE_API_KEY: process.env.AI_SERVICE_API_KEY || 'default-dev-key',
  
  // File Upload Configuration
  MAX_FILE_SIZE: process.env.MAX_FILE_SIZE || '10MB',
  UPLOAD_PATH: process.env.UPLOAD_PATH || './uploads',
  
  // Rate Limiting
  RATE_LIMIT_WINDOW_MS: process.env.RATE_LIMIT_WINDOW_MS || 900000, // 15 minutes
  RATE_LIMIT_MAX_REQUESTS: process.env.RATE_LIMIT_MAX_REQUESTS || 100,
  
  // CORS Configuration
  CORS_ORIGIN: process.env.CORS_ORIGIN || 'http://localhost:3000',
  FRONTEND_URL: process.env.FRONTEND_URL || 'http://localhost:3000',
  
  // Logging
  LOG_LEVEL: process.env.LOG_LEVEL || 'info',
  LOG_FILE: process.env.LOG_FILE || './logs/app.log',
  
  // Security
  BCRYPT_ROUNDS: parseInt(process.env.BCRYPT_ROUNDS, 10) || 12,
  SESSION_SECRET: process.env.SESSION_SECRET,
  
  // External Services
  PUSH_NOTIFICATION_SERVICE_URL: process.env.PUSH_NOTIFICATION_SERVICE_URL,
  PUSH_NOTIFICATION_API_KEY: process.env.PUSH_NOTIFICATION_API_KEY,
  
  // Analytics
  ANALYTICS_SYNC_INTERVAL: process.env.ANALYTICS_SYNC_INTERVAL || '3600000', // 1 hour
  CLEANUP_INTERVAL: process.env.CLEANUP_INTERVAL || '86400000', // 24 hours
};

// ✅ Validate required environment variables
const requiredEnvVars = [

  'MONGODB_URI',
  'REDIS_URL',
  'JWT_SECRET',
  'JWT_REFRESH_SECRET'
];

const missingEnvVars = requiredEnvVars.filter(envVar => !process.env[envVar]);

if (missingEnvVars.length > 0) {
  console.error('❌ Missing required environment variables:', missingEnvVars);
  process.exit(1); // Always exit if critical env vars are missing
}

// ✅ Validate PORT is within valid range
if (config.PORT < 0 || config.PORT > 65535) {
  console.error('❌ Invalid PORT value:', config.PORT, '- must be between 0 and 65535');
  process.exit(1);
}

module.exports = config;