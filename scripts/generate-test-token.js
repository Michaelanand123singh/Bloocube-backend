#!/usr/bin/env node

/**
 * Generate Test JWT Token
 * 
 * This script generates a valid JWT token for testing purposes
 */

const jwt = require('jsonwebtoken');
const config = require('../src/config/env');

// Test user data
const testUser = {
  id: '507f1f77bcf86cd799439011', // Test user ID
  email: 'test@bloocube.com',
  role: 'user',
  name: 'Test User'
};

// Generate test token
function generateTestToken() {
  try {
    if (!config.JWT_SECRET) {
      console.error('❌ JWT_SECRET is not set in environment variables');
      console.log('💡 Please set JWT_SECRET in your .env file');
      process.exit(1);
    }

    const token = jwt.sign(testUser, config.JWT_SECRET, {
      expiresIn: '1h', // 1 hour expiry for testing
      issuer: 'bloocube-api',
      audience: 'bloocube-client'
    });

    // Only print details if called directly (not imported)
    if (require.main === module) {
      console.log('🔑 Test JWT Token Generated Successfully!');
      console.log('='.repeat(60));
      console.log('Token:', token);
      console.log('='.repeat(60));
      console.log('User Data:', JSON.stringify(testUser, null, 2));
      console.log('='.repeat(60));
      console.log('💡 Use this token in your test scripts');
      console.log('💡 Token expires in 1 hour');
    }
    
    return token;
  } catch (error) {
    console.error('❌ Error generating test token:', error.message);
    process.exit(1);
  }
}

// Verify token
function verifyToken(token) {
  try {
    const decoded = jwt.verify(token, config.JWT_SECRET);
    console.log('✅ Token verification successful');
    console.log('Decoded payload:', JSON.stringify(decoded, null, 2));
    return true;
  } catch (error) {
    console.error('❌ Token verification failed:', error.message);
    return false;
  }
}

// Main function
function main() {
  const args = process.argv.slice(2);
  
  if (args.includes('--verify')) {
    const token = args[1];
    if (!token) {
      console.error('❌ Please provide a token to verify');
      console.log('Usage: node generate-test-token.js --verify <token>');
      process.exit(1);
    }
    verifyToken(token);
  } else {
    generateTestToken();
  }
}

// Run if called directly
if (require.main === module) {
  main();
}

module.exports = {
  generateTestToken,
  verifyToken,
  testUser
};
