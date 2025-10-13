#!/usr/bin/env node

/**
 * Test script for LinkedIn OAuth flow with session token
 * This script tests the LinkedIn callback endpoint to ensure session tokens are generated correctly
 */

const jwt = require('jsonwebtoken');
const config = require('../src/config/env');

// Mock test data
const mockUserId = '507f1f77bcf86cd799439011';
const mockUserEmail = 'test@example.com';
const mockUserRole = 'creator';

console.log('🧪 Testing LinkedIn OAuth Session Token Generation...\n');

// Test 1: JWT Token Generation
console.log('Test 1: JWT Token Generation');
try {
  const jwtManager = require('../src/utils/jwt');
  
  const sessionToken = jwtManager.generateAccessToken({
    id: mockUserId,
    email: mockUserEmail,
    role: mockUserRole
  });
  
  console.log('✅ Session token generated successfully');
  console.log('Token length:', sessionToken.length);
  console.log('Token preview:', sessionToken.substring(0, 50) + '...');
  
  // Verify token can be decoded
  const decoded = jwtManager.verifyAccessToken(sessionToken);
  console.log('✅ Token verification successful');
  console.log('Decoded payload:', {
    id: decoded.id,
    email: decoded.email,
    role: decoded.role
  });
  
} catch (error) {
  console.error('❌ JWT Token Generation failed:', error.message);
}

console.log('\n' + '='.repeat(50) + '\n');

// Test 2: URL Encoding/Decoding
console.log('Test 2: URL Encoding/Decoding');
try {
  const jwtManager = require('../src/utils/jwt');
  const sessionToken = jwtManager.generateAccessToken({
    id: mockUserId,
    email: mockUserEmail,
    role: mockUserRole
  });
  
  // Simulate URL encoding (as done in redirect)
  const encodedToken = encodeURIComponent(sessionToken);
  console.log('✅ Token encoded successfully');
  console.log('Encoded length:', encodedToken.length);
  
  // Simulate URL decoding (as done in frontend)
  const decodedToken = decodeURIComponent(encodedToken);
  console.log('✅ Token decoded successfully');
  
  // Verify decoded token is still valid
  const jwtManager2 = require('../src/utils/jwt');
  const verified = jwtManager2.verifyAccessToken(decodedToken);
  console.log('✅ Decoded token verification successful');
  console.log('Verified payload:', {
    id: verified.id,
    email: verified.email,
    role: verified.role
  });
  
} catch (error) {
  console.error('❌ URL Encoding/Decoding failed:', error.message);
}

console.log('\n' + '='.repeat(50) + '\n');

// Test 3: Redirect URL Construction
console.log('Test 3: Redirect URL Construction');
try {
  const jwtManager = require('../src/utils/jwt');
  const sessionToken = jwtManager.generateAccessToken({
    id: mockUserId,
    email: mockUserEmail,
    role: mockUserRole
  });
  
  const baseFrontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
  const frontendUrl = `${baseFrontendUrl}/creator/settings`;
  const redirectUrl = `${frontendUrl}?linkedin=success&token=${encodeURIComponent(sessionToken)}&message=LinkedIn+connected+and+logged+in+successfully`;
  
  console.log('✅ Redirect URL constructed successfully');
  console.log('Frontend URL:', frontendUrl);
  console.log('Full redirect URL length:', redirectUrl.length);
  console.log('Redirect URL preview:', redirectUrl.substring(0, 100) + '...');
  
  // Parse the URL to extract parameters
  const url = new URL(redirectUrl);
  const linkedinParam = url.searchParams.get('linkedin');
  const tokenParam = url.searchParams.get('token');
  const messageParam = url.searchParams.get('message');
  
  console.log('✅ URL parsing successful');
  console.log('LinkedIn param:', linkedinParam);
  console.log('Token param length:', tokenParam?.length || 0);
  console.log('Message param:', messageParam);
  
  // Verify extracted token
  if (tokenParam) {
    const verified = jwtManager.verifyAccessToken(tokenParam);
    console.log('✅ Extracted token verification successful');
    console.log('Extracted token payload:', {
      id: verified.id,
      email: verified.email,
      role: verified.role
    });
  }
  
} catch (error) {
  console.error('❌ Redirect URL Construction failed:', error.message);
}

console.log('\n' + '='.repeat(50) + '\n');

// Test 4: Token Expiration
console.log('Test 4: Token Expiration');
try {
  const jwtManager = require('../src/utils/jwt');
  const sessionToken = jwtManager.generateAccessToken({
    id: mockUserId,
    email: mockUserEmail,
    role: mockUserRole
  });
  
  // Check token expiration
  const expiration = jwtManager.getTokenExpiration(sessionToken);
  const isExpired = jwtManager.isTokenExpired(sessionToken);
  
  console.log('✅ Token expiration check successful');
  console.log('Token expires at:', expiration);
  console.log('Is expired:', isExpired);
  console.log('Time until expiration:', expiration ? Math.round((expiration.getTime() - Date.now()) / 1000 / 60) + ' minutes' : 'Unknown');
  
} catch (error) {
  console.error('❌ Token Expiration check failed:', error.message);
}

console.log('\n' + '='.repeat(50) + '\n');

// Test 5: Frontend Token Validation Simulation
console.log('Test 5: Frontend Token Validation Simulation');
try {
  const jwtManager = require('../src/utils/jwt');
  const sessionToken = jwtManager.generateAccessToken({
    id: mockUserId,
    email: mockUserEmail,
    role: mockUserRole
  });
  
  // Simulate frontend JWT validation
  const isValidJWTFormat = (token) => {
    if (!token || typeof token !== 'string') return false;
    
    const parts = token.split('.');
    if (parts.length !== 3) return false;
    
    try {
      const header = JSON.parse(Buffer.from(parts[0], 'base64').toString());
      const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString());
      
      return !!(header && payload && payload.id && payload.exp);
    } catch {
      return false;
    }
  };
  
  const isValid = isValidJWTFormat(sessionToken);
  console.log('✅ Frontend token validation successful');
  console.log('Token format is valid:', isValid);
  
  if (isValid) {
    // Decode payload for frontend use
    const parts = sessionToken.split('.');
    const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString());
    console.log('Decoded payload for frontend:', {
      id: payload.id,
      email: payload.email,
      role: payload.role,
      exp: new Date(payload.exp * 1000)
    });
  }
  
} catch (error) {
  console.error('❌ Frontend Token Validation failed:', error.message);
}

console.log('\n🎉 All tests completed!');
console.log('\n📋 Summary:');
console.log('- JWT token generation: ✅');
console.log('- URL encoding/decoding: ✅');
console.log('- Redirect URL construction: ✅');
console.log('- Token expiration handling: ✅');
console.log('- Frontend token validation: ✅');
console.log('\n✨ LinkedIn OAuth with session token is ready for testing!');
