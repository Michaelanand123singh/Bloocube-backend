// src/utils/logger.js
const winston = require('winston');
const path = require('path');
const config = require('../config/env');

// Define log format
const logFormat = winston.format.combine(
  winston.format.timestamp({
    format: 'YYYY-MM-DD HH:mm:ss'
  }),
  winston.format.errors({ stack: true }),
  winston.format.json(),
  winston.format.prettyPrint()
);

// Define console format for development
const consoleFormat = winston.format.combine(
  winston.format.colorize(),
  winston.format.timestamp({
    format: 'HH:mm:ss'
  }),
  winston.format.printf(({ timestamp, level, message, ...meta }) => {
    let msg = `${timestamp} [${level}]: ${message}`;
    if (Object.keys(meta).length > 0) {
      msg += ` ${JSON.stringify(meta, null, 2)}`;
    }
    return msg;
  })
);

// Create logger instance
const logger = winston.createLogger({
  level: config.LOG_LEVEL || 'info',
  format: logFormat,
  defaultMeta: { service: 'bloocube-backend' },
  transports: [
    // Write all logs with level 'error' and below to error.log
    new winston.transports.File({
      filename: path.join(process.cwd(), 'logs', 'error.log'),
      level: 'error',
      maxsize: 5242880, // 5MB
      maxFiles: 5
    }),
    // Write all logs with level 'info' and below to combined.log
    new winston.transports.File({
      filename: path.join(process.cwd(), 'logs', 'combined.log'),
      maxsize: 5242880, // 5MB
      maxFiles: 5
    })
  ],
  exceptionHandlers: [
    new winston.transports.File({
      filename: path.join(process.cwd(), 'logs', 'exceptions.log')
    })
  ],
  rejectionHandlers: [
    new winston.transports.File({
      filename: path.join(process.cwd(), 'logs', 'rejections.log')
    })
  ]
});

// Add console transport for non-production environments
if (config.NODE_ENV !== 'production') {
  logger.add(new winston.transports.Console({
    format: consoleFormat
  }));
}

// Create logs directory if it doesn't exist
const fs = require('fs');
const logsDir = path.join(process.cwd(), 'logs');
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

// Custom logging methods
logger.request = (req, res, responseTime) => {
  logger.info('HTTP Request', {
    method: req.method,
    url: req.url,
    status: res.statusCode,
    responseTime: `${responseTime}ms`,
    userAgent: req.get('User-Agent'),
    ip: req.ip
  });
};

logger.error = (message, error = null, meta = {}) => {
  if (error instanceof Error) {
    logger.log({
      level: 'error',
      message,
      ...meta,
      stack: error.stack,
      name: error.name,
      errorMessage: error.message
    });
  } else {
    logger.log({ level: 'error', message, ...meta, error });
  }
};

logger.security = (message, meta = {}) => {
  logger.warn(`SECURITY: ${message}`, {
    ...meta,
    timestamp: new Date().toISOString(),
    type: 'security'
  });
};

logger.performance = (operation, duration, meta = {}) => {
  logger.info(`PERFORMANCE: ${operation}`, {
    ...meta,
    duration: `${duration}ms`,
    type: 'performance'
  });
};

logger.database = (operation, collection, duration, meta = {}) => {
  logger.info(`DATABASE: ${operation}`, {
    ...meta,
    collection,
    duration: `${duration}ms`,
    type: 'database'
  });
};

logger.api = (service, endpoint, method, status, duration, meta = {}) => {
  const level = status >= 400 ? 'error' : 'info';
  logger[level](`API: ${service} ${method} ${endpoint}`, {
    ...meta,
    service,
    endpoint,
    method,
    status,
    duration: `${duration}ms`,
    type: 'api'
  });
};

module.exports = logger;
