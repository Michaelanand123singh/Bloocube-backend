#!/usr/bin/env node

/**
 * Google OAuth Configuration Checker
 * Validates Google OAuth setup for production
 */

const config = require('../src/config/env');
const axios = require('axios');

async function checkGoogleOAuthConfig() {
  console.log('🔍 Checking Google OAuth Configuration...\n');
  
  // Check environment variables
  console.log('📋 Environment Variables:');
  console.log(`   NODE_ENV: ${config.NODE_ENV}`);
  console.log(`   GOOGLE_CLIENT_ID: ${config.GOOGLE_CLIENT_ID ? '✅ Set' : '❌ Missing'}`);
  console.log(`   GOOGLE_CLIENT_SECRET: ${config.GOOGLE_CLIENT_SECRET ? '✅ Set' : '❌ Missing'}`);
  console.log(`   GOOGLE_SCOPES: ${config.GOOGLE_SCOPES}`);
  console.log(`   FRONTEND_URL: ${config.FRONTEND_URL || 'Not set'}\n`);
  
  if (!config.GOOGLE_CLIENT_ID || !config.GOOGLE_CLIENT_SECRET) {
    console.error('❌ Google OAuth credentials are missing!');
    process.exit(1);
  }
  
  // Check redirect URI
  const expectedRedirectUri = `${config.FRONTEND_URL || 'https://bloocube.com'}/auth/google/callback`;
  console.log('🔗 Redirect URI Configuration:');
  console.log(`   Expected: ${expectedRedirectUri}`);
  console.log(`   ⚠️  Make sure this URI is configured in Google Cloud Console\n`);
  
  // Test Google OAuth endpoints
  console.log('🌐 Testing Google OAuth Endpoints:');
  
  try {
    // Test token endpoint
    const tokenResponse = await axios.get('https://oauth2.googleapis.com/token', {
      timeout: 5000
    });
    console.log('   ✅ Google OAuth token endpoint accessible');
  } catch (error) {
    console.log('   ❌ Google OAuth token endpoint not accessible:', error.message);
  }
  
  try {
    // Test userinfo endpoint
    const userInfoResponse = await axios.get('https://www.googleapis.com/oauth2/v3/userinfo', {
      timeout: 5000
    });
    console.log('   ✅ Google OAuth userinfo endpoint accessible');
  } catch (error) {
    console.log('   ❌ Google OAuth userinfo endpoint not accessible:', error.message);
  }
  
  // Check if running in production
  if (config.NODE_ENV === 'production') {
    console.log('\n🚀 Production Environment Checks:');
    
    // Check if HTTPS is being used
    const frontendUrl = config.FRONTEND_URL || 'https://bloocube.com';
    if (frontendUrl.startsWith('https://')) {
      console.log('   ✅ Frontend URL uses HTTPS');
    } else {
      console.log('   ❌ Frontend URL should use HTTPS in production');
    }
    
    // Check redirect URI format
    if (expectedRedirectUri.startsWith('https://')) {
      console.log('   ✅ Redirect URI uses HTTPS');
    } else {
      console.log('   ❌ Redirect URI should use HTTPS in production');
    }
  }
  
  console.log('\n📝 Next Steps:');
  console.log('   1. Verify the redirect URI is configured in Google Cloud Console');
  console.log('   2. Check that the OAuth consent screen is properly configured');
  console.log('   3. Ensure the domain is verified in Google Cloud Console');
  console.log('   4. Test the OAuth flow in production');
  
  console.log('\n✅ Google OAuth configuration check completed!');
}

// Run the check
checkGoogleOAuthConfig().catch(error => {
  console.error('💥 Error checking Google OAuth configuration:', error);
  process.exit(1);
});

