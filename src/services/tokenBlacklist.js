// src/services/tokenBlacklist.js
const redisClient = require('../config/redis');
const logger = require('../utils/logger');
const jwtManager = require('../utils/jwt');

// In-memory fallback when Redis is unavailable. Stores until process restarts.
const memoryBlacklist = new Map(); // key: token, value: expiresAt (ms epoch)

function getTtlSecondsFromJwt(token) {
  try {
    const decoded = jwtManager.decode(token);
    if (!decoded || !decoded.exp) return null;
    const expiresAtMs = decoded.exp * 1000;
    const ttlMs = expiresAtMs - Date.now();
    return ttlMs > 0 ? Math.ceil(ttlMs / 1000) : 0;
  } catch {
    return null;
  }
}

function sweepMemory() {
  const now = Date.now();
  for (const [token, expiresAt] of memoryBlacklist.entries()) {
    if (expiresAt <= now) memoryBlacklist.delete(token);
  }
}

setInterval(sweepMemory, 60 * 1000).unref();

const key = (t) => `blacklist:jwt:${t}`;

module.exports = {
  // Revoke a token until it naturally expires
  async blacklistToken(token) {
    if (!token) return false;
    const ttl = getTtlSecondsFromJwt(token);
    if (ttl === 0) return true; // already expired

    try {
      if (ttl && await redisClient.set(key(token), '1', ttl)) {
        logger.info('Token blacklisted in Redis');
        return true;
      }
    } catch (e) {
      logger.warn('Failed to blacklist token in Redis, using memory fallback');
    }

    // Fallback to memory map
    const decoded = jwtManager.decode(token);
    const expMs = decoded?.exp ? decoded.exp * 1000 : Date.now() + 10 * 60 * 1000;
    memoryBlacklist.set(token, expMs);
    return true;
  },

  // Check if a token is revoked
  async isBlacklisted(token) {
    if (!token) return false;
    try {
      const exists = await redisClient.exists(key(token));
      if (exists) return true;
    } catch {}
    const expiresAt = memoryBlacklist.get(token);
    if (!expiresAt) return false;
    if (expiresAt <= Date.now()) {
      memoryBlacklist.delete(token);
      return false;
    }
    return true;
  }
};


