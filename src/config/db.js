// src/config/db.js
const mongoose = require('mongoose');
const logger = require('../utils/logger');

const connectDB = async () => {
  try {
    // Check if MONGODB_URI is provided
    if (!process.env.MONGODB_URI) {
      logger.warn('MONGODB_URI not provided. Database connection skipped.');
      return;
    }

    const conn = await mongoose.connect(process.env.MONGODB_URI); // no deprecated options

    logger.info(`MongoDB Connected: ${conn.connection.host}`);

    // Connection event listeners
    mongoose.connection.on('error', (err) => {
      logger.error('MongoDB connection error:', err);
    });

    mongoose.connection.on('disconnected', () => {
      logger.warn('MongoDB disconnected');
    });

    mongoose.connection.on('reconnected', () => {
      logger.info('MongoDB reconnected');
    });

    // Graceful shutdown
    process.on('SIGINT', async () => {
      await mongoose.connection.close();
      logger.info('MongoDB connection closed through app termination');
      process.exit(0);
    });

  } catch (error) {
    logger.error('Database connection failed:', error);
    
    // In development mode, don't exit the process if database connection fails
    if (process.env.NODE_ENV === 'development') {
      logger.warn('Running in development mode without database connection');
      return;
    }
    
    // In production, exit if database connection fails
    process.exit(1);
  }
};

module.exports = connectDB;
