// src/config/redis.js
const redis = require('redis');

class RedisClient {
  constructor() {
    this.client = null;
    this.isConnected = false;
  }

  async connect() {
    // Skip Redis in dev mode if not configured
    if (process.env.NODE_ENV === 'development' && !process.env.REDIS_URL) {
      console.log('ℹ️ Redis connection skipped in development mode');
      return;
    }

    this.client = redis.createClient({
      url: process.env.REDIS_URL || 'redis://localhost:6379',
      socket: {
        connectTimeout: 5000,
        reconnectStrategy: (retries) => {
          if (retries > 3) {
            console.log('⚠️ Redis: stopped retrying after 3 attempts');
            return false;
          }
          return Math.min(retries * 200, 3000); // backoff
        }
      }
    });

    // Event listeners
    this.client.on('connect', () => {
      if (!this.isConnected) {
        console.log('✅ Redis client connected');
      }
      this.isConnected = true;
    });

    this.client.on('error', (err) => {
      console.log('❌ Redis error:', err.message);
      this.isConnected = false;
    });

    this.client.on('end', () => {
      console.log('⚠️ Redis client disconnected');
      this.isConnected = false;
    });

    // Try initial connect without blocking server startup
    this.client.connect().catch((err) => {
      console.log('⚠️ Initial Redis connection failed:', err.message);
      console.log('ℹ️ Server will continue without Redis (retry may happen)');
    });
  }

  async get(key) {
    if (!this.isConnected) return null;
    try {
      return await this.client.get(key);
    } catch (err) {
      console.log('Redis GET error:', err.message);
      return null;
    }
  }

  async set(key, value, expireInSeconds = null) {
    if (!this.isConnected) return false;
    try {
      if (expireInSeconds) {
        return await this.client.setEx(key, expireInSeconds, value);
      }
      return await this.client.set(key, value);
    } catch (err) {
      console.log('Redis SET error:', err.message);
      return false;
    }
  }

  async incr(key) {
    if (!this.isConnected) return null;
    try {
      return await this.client.incr(key);
    } catch (err) {
      console.log('Redis INCR error:', err.message);
      return null;
    }
  }

  async decr(key) {
    if (!this.isConnected) return null;
    try {
      return await this.client.decr(key);
    } catch (err) {
      console.log('Redis DECR error:', err.message);
      return null;
    }
  }

  async del(key) {
    if (!this.isConnected) return false;
    try {
      return await this.client.del(key);
    } catch (err) {
      console.log('Redis DEL error:', err.message);
      return false;
    }
  }

  async exists(key) {
    if (!this.isConnected) return false;
    try {
      return await this.client.exists(key);
    } catch (err) {
      console.log('Redis EXISTS error:', err.message);
      return false;
    }
  }

  async disconnect() {
    if (this.client && this.isConnected) {
      try {
        await this.client.quit();
        this.isConnected = false;
        console.log('ℹ️ Redis client disconnected manually');
      } catch (err) {
        console.log('Redis disconnect error:', err.message);
      }
    }
  }
}

const redisClient = new RedisClient();
module.exports = redisClient;
