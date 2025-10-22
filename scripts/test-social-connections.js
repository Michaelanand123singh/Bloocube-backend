#!/usr/bin/env node

/**
 * Test script for social media connections
 * This script tests all social media platform connections
 */

const axios = require('axios');
const config = require('../src/config/env');
const { generateTestToken } = require('./generate-test-token');

const API_BASE = process.env.API_BASE || 'http://localhost:5000';
let TEST_JWT = null; // Will be generated dynamically

// Test configuration
const tests = [
  {
    name: 'Twitter Connection Test',
    endpoint: '/api/twitter/auth-url',
    method: 'POST',
    data: { redirectUri: 'https://yourdomain.com/auth/twitter/callback' },
    requiredEnvVars: ['TWITTER_APP_KEY', 'TWITTER_APP_SECRET'],
    oauthType: '1.0a'
  },
  {
    name: 'Instagram Connection Test',
    endpoint: '/api/instagram/auth-url',
    method: 'POST',
    data: { redirectUri: 'https://yourdomain.com/auth/instagram/callback' },
    requiredEnvVars: ['FACEBOOK_APP_ID', 'FACEBOOK_APP_SECRET'],
    oauthType: '2.0'
  },
  {
    name: 'LinkedIn Connection Test',
    endpoint: '/api/linkedin/auth-url',
    method: 'POST',
    data: { redirectUri: 'https://yourdomain.com/auth/linkedin/callback' },
    requiredEnvVars: ['LINKEDIN_CLIENT_ID', 'LINKEDIN_CLIENT_SECRET'],
    oauthType: '2.0'
  },
  {
    name: 'Facebook Connection Test',
    endpoint: '/api/facebook/auth-url',
    method: 'POST',
    data: { redirectUri: 'https://yourdomain.com/auth/facebook/callback' },
    requiredEnvVars: ['FACEBOOK_APP_ID', 'FACEBOOK_APP_SECRET'],
    oauthType: '2.0'
  },
  {
    name: 'YouTube Connection Test',
    endpoint: '/api/youtube/auth-url',
    method: 'POST',
    data: { redirectUri: 'https://yourdomain.com/auth/youtube/callback' },
    requiredEnvVars: ['YOUTUBE_CLIENT_ID', 'YOUTUBE_CLIENT_SECRET'],
    oauthType: '2.0'
  }
];

// Helper function to check environment variables
function checkEnvVars(requiredVars) {
  const missing = [];
  const present = [];
  
  requiredVars.forEach(varName => {
    if (!process.env[varName] || process.env[varName].includes('YOUR_') || process.env[varName].includes('HERE')) {
      missing.push(varName);
    } else {
      present.push(varName);
    }
  });
  
  return { missing, present };
}

// Helper function to make API request
async function makeRequest(test) {
  try {
    const response = await axios({
      method: test.method,
      url: `${API_BASE}${test.endpoint}`,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${TEST_JWT}`
      },
      data: test.data,
      timeout: 10000
    });
    
    return {
      success: true,
      status: response.status,
      data: response.data
    };
  } catch (error) {
    return {
      success: false,
      status: error.response?.status || 0,
      error: error.response?.data || error.message
    };
  }
}

// Main test function
async function runTests() {
  console.log('🧪 Starting Social Media Connection Tests...\n');
  console.log(`API Base URL: ${API_BASE}`);
  
  // First check if server is running
  try {
    await axios.get(`${API_BASE}/api/health`, { timeout: 5000 });
    console.log('✅ Backend server is running and accessible\n');
  } catch (error) {
    console.log('❌ Backend server is not running or not accessible');
    console.log(`   Server URL: ${API_BASE}`);
    console.log(`   Error: ${error.code === 'ECONNREFUSED' ? 'Connection refused - server not running' : error.message}`);
    console.log('\n💡 To fix this:');
    console.log('   1. Start the backend server: npm run dev');
    console.log('   2. Ensure the server is running on the correct port');
    console.log('   3. Check if there are any firewall issues\n');
    return;
  }

  // Generate test token
  try {
    TEST_JWT = generateTestToken();
    console.log('✅ Test JWT token generated successfully');
    console.log(`Test JWT: ${TEST_JWT.substring(0, 20)}...\n`);
  } catch (error) {
    console.log('❌ Failed to generate test JWT token');
    console.log(`   Error: ${error.message}`);
    console.log('\n💡 To fix this:');
    console.log('   1. Ensure JWT_SECRET is set in your .env file');
    console.log('   2. Check if the JWT utility is working correctly\n');
    return;
  }
  
  let passed = 0;
  let failed = 0;
  let skipped = 0;
  
  for (const test of tests) {
    console.log(`\n📋 Testing: ${test.name}`);
    console.log(`Endpoint: ${test.method} ${test.endpoint}`);
    console.log(`OAuth Type: ${test.oauthType || '2.0'}`);
    
    // Check environment variables first
    const envCheck = checkEnvVars(test.requiredEnvVars);
    
    if (envCheck.missing.length > 0) {
      console.log(`❌ SKIPPED - Missing environment variables: ${envCheck.missing.join(', ')}`);
      console.log(`   Present: ${envCheck.present.join(', ')}`);
      skipped++;
      continue;
    }
    
    console.log(`✅ Environment variables: ${envCheck.present.join(', ')}`);
    
    // Make the API request
    const result = await makeRequest(test);
    
    if (result.success) {
      console.log(`✅ PASSED - Status: ${result.status}`);
      if (result.data.authURL) {
        console.log(`   Auth URL: ${result.data.authURL.substring(0, 50)}...`);
      }
      passed++;
    } else {
      console.log(`❌ FAILED - Status: ${result.status}`);
      console.log(`   Error: ${JSON.stringify(result.error, null, 2)}`);
      failed++;
    }
  }
  
  // Summary
  console.log('\n' + '='.repeat(50));
  console.log('📊 TEST SUMMARY');
  console.log('='.repeat(50));
  console.log(`✅ Passed: ${passed}`);
  console.log(`❌ Failed: ${failed}`);
  console.log(`⏭️  Skipped: ${skipped}`);
  console.log(`📈 Total: ${passed + failed + skipped}`);
  
  if (failed > 0) {
    console.log('\n🔧 To fix failed tests:');
    console.log('1. Set up the required API credentials');
    console.log('2. Ensure the backend server is running');
    console.log('3. Check that the JWT token is valid');
    console.log('4. Verify the API endpoints are accessible');
  }
  
  if (skipped > 0) {
    console.log('\n📝 To enable skipped tests:');
    console.log('1. Set the required environment variables');
    console.log('2. Replace placeholder values with actual API credentials');
    console.log('3. Restart the backend server');
  }
  
  console.log('\n🎯 Next Steps:');
  console.log('1. Fix any failed tests by setting up API credentials');
  console.log('2. Test the OAuth flows in the frontend');
  console.log('3. Verify posting functionality works');
  console.log('4. Monitor error logs for any issues');
  
  process.exit(failed > 0 ? 1 : 0);
}

// Run the tests
runTests().catch(error => {
  console.error('💥 Test runner error:', error);
  process.exit(1);
});
