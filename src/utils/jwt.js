// src/utils/jwt.js
const jwt = require('jsonwebtoken');
const config = require('../config/env');
const logger = require('./logger');

class JWTManager {
  constructor() {
    this.secret = config.JWT_SECRET;
    this.refreshSecret = config.JWT_REFRESH_SECRET;
    this.expiresIn = config.JWT_EXPIRE || '7d';
    this.refreshExpiresIn = config.JWT_REFRESH_EXPIRE || '30d';
  }

  /**
   * Generate access token
   * @param {Object} payload - Token payload
   * @returns {String} JWT token
   */
  generateAccessToken(payload) {
    try {
      return jwt.sign(payload, this.secret, {
        expiresIn: this.expiresIn,
        issuer: 'bloocube-api',
        audience: 'bloocube-client'
      });
    } catch (error) {
      logger.error('Error generating access token', error);
      throw new Error('Token generation failed');
    }
  }

  /**
   * Generate refresh token
   * @param {Object} payload - Token payload
   * @returns {String} JWT refresh token
   */
  generateRefreshToken(payload) {
    try {
      return jwt.sign(payload, this.refreshSecret, {
        expiresIn: this.refreshExpiresIn,
        issuer: 'bloocube-api',
        audience: 'bloocube-client'
      });
    } catch (error) {
      logger.error('Error generating refresh token', error);
      throw new Error('Refresh token generation failed');
    }
  }

  /**
   * Generate token pair (access + refresh)
   * @param {Object} payload - Token payload
   * @returns {Object} Token pair
   */
  generateTokenPair(payload) {
    const accessToken = this.generateAccessToken(payload);
    const refreshToken = this.generateRefreshToken({ id: payload.id });
    
    return {
      accessToken,
      refreshToken,
      expiresIn: this.expiresIn
    };
  }

  /**
   * Verify access token
   * @param {String} token - JWT token
   * @returns {Object} Decoded token payload
   */
  verifyAccessToken(token) {
    try {
      return jwt.verify(token, this.secret, {
        issuer: 'bloocube-api',
        audience: 'bloocube-client'
      });
    } catch (error) {
      if (error.name === 'TokenExpiredError') {
        throw new Error('Token has expired');
      } else if (error.name === 'JsonWebTokenError') {
        throw new Error('Invalid token');
      } else {
        logger.error('Token verification error', error);
        throw new Error('Token verification failed');
      }
    }
  }

  /**
   * Verify refresh token
   * @param {String} token - JWT refresh token
   * @returns {Object} Decoded token payload
   */
  verifyRefreshToken(token) {
    try {
      return jwt.verify(token, this.refreshSecret, {
        issuer: 'bloocube-api',
        audience: 'bloocube-client'
      });
    } catch (error) {
      if (error.name === 'TokenExpiredError') {
        throw new Error('Refresh token has expired');
      } else if (error.name === 'JsonWebTokenError') {
        throw new Error('Invalid refresh token');
      } else {
        logger.error('Refresh token verification error', error);
        throw new Error('Refresh token verification failed');
      }
    }
  }

  /**
   * Decode token without verification (for debugging)
   * @param {String} token - JWT token
   * @returns {Object} Decoded token payload
   */
  decodeToken(token) {
    try {
      return jwt.decode(token);
    } catch (error) {
      logger.error('Token decode error', error);
      return null;
    }
  }

  /**
   * Get token expiration time
   * @param {String} token - JWT token
   * @returns {Date} Expiration date
   */
  getTokenExpiration(token) {
    try {
      const decoded = jwt.decode(token);
      return new Date(decoded.exp * 1000);
    } catch (error) {
      logger.error('Error getting token expiration', error);
      return null;
    }
  }

  /**
   * Check if token is expired
   * @param {String} token - JWT token
   * @returns {Boolean} True if expired
   */
  isTokenExpired(token) {
    try {
      const expiration = this.getTokenExpiration(token);
      return expiration ? new Date() > expiration : true;
    } catch (error) {
      logger.error('Error checking token expiration', error);
      return true;
    }
  }

  /**
   * Extract token from Authorization header
   * @param {String} authHeader - Authorization header value
   * @returns {String} Token
   */
  extractTokenFromHeader(authHeader) {
    if (!authHeader) {
      throw new Error('Authorization header missing');
    }

    const parts = authHeader.split(' ');
    if (parts.length !== 2 || parts[0] !== 'Bearer') {
      throw new Error('Invalid authorization format');
    }

    return parts[1];
  }

  /**
   * Generate password reset token
   * @param {String} userId - User ID
   * @param {String} redirectTo - Where to redirect after password reset ('login' or 'settings')
   * @returns {String} Password reset token
   */
  generatePasswordResetToken(userId, redirectTo = 'login') {
    try {
      return jwt.sign(
        { id: userId, type: 'password_reset', redirectTo },
        this.secret,
        { expiresIn: '1h' }
      );
    } catch (error) {
      logger.error('Error generating password reset token', error);
      throw new Error('Password reset token generation failed');
    }
  }

  /**
   * Verify password reset token
   * @param {String} token - Password reset token
   * @returns {Object} Decoded token payload
   */
  verifyPasswordResetToken(token) {
    try {
      const decoded = jwt.verify(token, this.secret);
      if (decoded.type !== 'password_reset') {
        throw new Error('Invalid token type');
      }
      return decoded;
    } catch (error) {
      if (error.name === 'TokenExpiredError') {
        throw new Error('Password reset token has expired');
      } else if (error.name === 'JsonWebTokenError') {
        throw new Error('Invalid password reset token');
      } else {
        logger.error('Password reset token verification error', error);
        throw new Error('Password reset token verification failed');
      }
    }
  }
}

const jwtManager = new JWTManager();

module.exports = jwtManager;