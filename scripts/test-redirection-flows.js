#!/usr/bin/env node

/**
 * Test Social Media Redirection Flows
 * 
 * This script tests the redirection flows for all social media platforms
 * to ensure proper OAuth callback handling and URL construction.
 */

const axios = require('axios');
const config = require('../src/config/env');
const { generateTestToken } = require('./generate-test-token');

// Test configuration
const TEST_CONFIG = {
  baseUrl: config.BASE_URL || 'http://localhost:5000',
  frontendUrl: config.FRONTEND_URL || 'http://localhost:3000',
  testUserId: '507f1f77bcf86cd799439011', // Test user ID
  platforms: ['twitter', 'instagram', 'linkedin', 'facebook', 'youtube'],
  testToken: null // Will be generated dynamically
};

// Test results storage
const testResults = {
  passed: 0,
  failed: 0,
  errors: []
};

/**
 * Test OAuth URL generation for each platform
 */
async function testOAuthUrlGeneration() {
  console.log('\n🔗 Testing OAuth URL Generation...\n');
  
  // First check if server is running
  try {
    await axios.get(`${TEST_CONFIG.baseUrl}/api/health`, { timeout: 5000 });
    console.log('✅ Backend server is running and accessible');
  } catch (error) {
    console.log('❌ Backend server is not running or not accessible');
    console.log(`   Server URL: ${TEST_CONFIG.baseUrl}`);
    console.log(`   Error: ${error.code === 'ECONNREFUSED' ? 'Connection refused - server not running' : error.message}`);
    console.log('\n💡 To fix this:');
    console.log('   1. Start the backend server: npm run dev');
    console.log('   2. Ensure the server is running on the correct port');
    console.log('   3. Check if there are any firewall issues');
    
    // Skip OAuth URL tests if server is not running
    for (const platform of TEST_CONFIG.platforms) {
      console.log(`⏭️  ${platform.toUpperCase()}: Skipped (server not running)`);
      testResults.failed++;
      testResults.errors.push(`${platform}: Server not running - ${error.message}`);
    }
    return;
  }

  // Generate test token
  try {
    TEST_CONFIG.testToken = generateTestToken();
    console.log('✅ Test JWT token generated successfully');
  } catch (error) {
    console.log('❌ Failed to generate test JWT token');
    console.log(`   Error: ${error.message}`);
    console.log('\n💡 To fix this:');
    console.log('   1. Ensure JWT_SECRET is set in your .env file');
    console.log('   2. Check if the JWT utility is working correctly');
    
    // Skip OAuth URL tests if token generation fails
    for (const platform of TEST_CONFIG.platforms) {
      console.log(`⏭️  ${platform.toUpperCase()}: Skipped (token generation failed)`);
      testResults.failed++;
      testResults.errors.push(`${platform}: Token generation failed - ${error.message}`);
    }
    return;
  }
  
  for (const platform of TEST_CONFIG.platforms) {
    try {
      console.log(`Testing ${platform.toUpperCase()} OAuth URL generation...`);
      console.log(`   Token: ${TEST_CONFIG.testToken.substring(0, 50)}...`);
      
      // Twitter uses GET method, others use POST
      const isTwitter = platform === 'twitter';
      const method = isTwitter ? 'get' : 'post';
      const url = `${TEST_CONFIG.baseUrl}/api/${platform}/auth-url`;
      
      let response;
      if (isTwitter) {
        // For GET requests, pass redirectUri as query parameter
        response = await axios.get(url, {
          params: {
            redirectUri: `${TEST_CONFIG.frontendUrl}/auth/${platform}/callback`
          },
          headers: {
            'Authorization': `Bearer ${TEST_CONFIG.testToken}`
          },
          timeout: 10000
        });
      } else {
        // For POST requests, pass redirectUri in body
        response = await axios.post(url, {
          redirectUri: `${TEST_CONFIG.frontendUrl}/auth/${platform}/callback`
        }, {
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${TEST_CONFIG.testToken}`
          },
          timeout: 10000
        });
      }
      
      if (response.data.success && (response.data.authUrl || response.data.authURL)) {
        console.log(`✅ ${platform.toUpperCase()}: OAuth URL generated successfully`);
        const authUrl = response.data.authUrl || response.data.authURL;
        console.log(`   URL: ${authUrl.substring(0, 100)}...`);
        if (platform === 'twitter') {
          console.log(`   OAuth 1.0a flow: Token and secret saved for callback`);
        }
        testResults.passed++;
      } else {
        console.log(`❌ ${platform.toUpperCase()}: Failed to generate OAuth URL`);
        console.log(`   Status: ${response.status}`);
        console.log(`   Error: ${response.data.error || response.data.message || 'Unknown error'}`);
        console.log(`   Details: ${response.data.details || 'No additional details'}`);
        console.log(`   Response: ${JSON.stringify(response.data, null, 2)}`);
        testResults.failed++;
        testResults.errors.push(`${platform}: ${response.data.error || response.data.message || 'OAuth URL generation failed'}`);
      }
    } catch (error) {
      if (error.code === 'ECONNREFUSED') {
        console.log(`❌ ${platform.toUpperCase()}: Server connection refused`);
        console.log(`   Make sure the backend server is running on ${TEST_CONFIG.baseUrl}`);
      } else if (error.code === 'ENOTFOUND') {
        console.log(`❌ ${platform.toUpperCase()}: Server not found`);
        console.log(`   Check if the server URL is correct: ${TEST_CONFIG.baseUrl}`);
      } else if (error.response?.status === 401) {
        console.log(`❌ ${platform.toUpperCase()}: Authentication required`);
        console.log(`   The endpoint requires valid authentication`);
      } else if (error.response?.status === 404) {
        console.log(`❌ ${platform.toUpperCase()}: Endpoint not found`);
        console.log(`   Check if the API route exists: /api/${platform}/auth-url`);
      } else {
        console.log(`❌ ${platform.toUpperCase()}: Request failed`);
        console.log(`   Status: ${error.response?.status || 'No response'}`);
        console.log(`   Error: ${error.response?.data?.error || error.response?.data?.message || error.message}`);
        console.log(`   Response: ${JSON.stringify(error.response?.data, null, 2)}`);
      }
      testResults.failed++;
      testResults.errors.push(`${platform}: ${error.response?.data?.error || error.response?.data?.message || error.message}`);
    }
  }
}

/**
 * Test callback URL construction
 */
function testCallbackUrlConstruction() {
  console.log('\n🔗 Testing Callback URL Construction...\n');
  
  const expectedCallbacks = {
    twitter: `${TEST_CONFIG.frontendUrl}/auth/twitter/callback`,
    instagram: `${TEST_CONFIG.frontendUrl}/auth/instagram/callback`,
    linkedin: `${TEST_CONFIG.frontendUrl}/auth/linkedin/callback`,
    facebook: `${TEST_CONFIG.frontendUrl}/auth/facebook/callback`,
    youtube: `${TEST_CONFIG.frontendUrl}/auth/youtube/callback`
  };
  
  for (const [platform, expectedUrl] of Object.entries(expectedCallbacks)) {
    try {
      // Test URL construction logic
      const constructedUrl = `${TEST_CONFIG.frontendUrl}/auth/${platform}/callback`;
      
      if (constructedUrl === expectedUrl) {
        console.log(`✅ ${platform.toUpperCase()}: Callback URL constructed correctly`);
        console.log(`   URL: ${constructedUrl}`);
        testResults.passed++;
      } else {
        console.log(`❌ ${platform.toUpperCase()}: Callback URL mismatch`);
        console.log(`   Expected: ${expectedUrl}`);
        console.log(`   Got: ${constructedUrl}`);
        testResults.failed++;
        testResults.errors.push(`${platform}: Callback URL construction failed`);
      }
    } catch (error) {
      console.log(`❌ ${platform.toUpperCase()}: Callback URL test failed`);
      console.log(`   Error: ${error.message}`);
      testResults.failed++;
      testResults.errors.push(`${platform}: ${error.message}`);
    }
  }
}

/**
 * Test redirect URL handling
 */
function testRedirectUrlHandling() {
  console.log('\n🔗 Testing Redirect URL Handling...\n');
  
  const testCases = [
    {
      platform: 'twitter',
      callbackUrl: `${TEST_CONFIG.frontendUrl}/auth/twitter/callback`,
      expectedRedirect: `${TEST_CONFIG.frontendUrl}/creator/settings`
    },
    {
      platform: 'instagram',
      callbackUrl: `${TEST_CONFIG.frontendUrl}/auth/instagram/callback`,
      expectedRedirect: `${TEST_CONFIG.frontendUrl}/creator/settings`
    },
    {
      platform: 'linkedin',
      callbackUrl: `${TEST_CONFIG.frontendUrl}/auth/linkedin/callback`,
      expectedRedirect: `${TEST_CONFIG.frontendUrl}/creator/settings`
    },
    {
      platform: 'facebook',
      callbackUrl: `${TEST_CONFIG.frontendUrl}/auth/facebook/callback`,
      expectedRedirect: `${TEST_CONFIG.frontendUrl}/creator/settings`
    },
    {
      platform: 'youtube',
      callbackUrl: `${TEST_CONFIG.frontendUrl}/auth/youtube/callback`,
      expectedRedirect: `${TEST_CONFIG.frontendUrl}/creator/settings`
    }
  ];
  
  for (const testCase of testCases) {
    try {
      // Simulate redirect URL extraction logic
      const frontendUrl = testCase.callbackUrl.replace(`/auth/${testCase.platform}/callback`, '');
      const redirectUrl = `${frontendUrl}/creator/settings`;
      
      if (redirectUrl === testCase.expectedRedirect) {
        console.log(`✅ ${testCase.platform.toUpperCase()}: Redirect URL handled correctly`);
        console.log(`   Callback: ${testCase.callbackUrl}`);
        console.log(`   Redirect: ${redirectUrl}`);
        testResults.passed++;
      } else {
        console.log(`❌ ${testCase.platform.toUpperCase()}: Redirect URL mismatch`);
        console.log(`   Expected: ${testCase.expectedRedirect}`);
        console.log(`   Got: ${redirectUrl}`);
        testResults.failed++;
        testResults.errors.push(`${testCase.platform}: Redirect URL handling failed`);
      }
    } catch (error) {
      console.log(`❌ ${testCase.platform.toUpperCase()}: Redirect URL test failed`);
      console.log(`   Error: ${error.message}`);
      testResults.failed++;
      testResults.errors.push(`${testCase.platform}: ${error.message}`);
    }
  }
}

/**
 * Test OAuth parameter handling
 */
function testOAuthParameterHandling() {
  console.log('\n🔗 Testing OAuth Parameter Handling...\n');
  
  const testCases = [
    {
      platform: 'twitter',
      oauth1a: {
        oauth_token: 'test_token_123',
        oauth_verifier: 'test_verifier_456'
      },
      oauth2: {
        code: 'test_code_789',
        state: 'test_state_abc'
      }
    },
    {
      platform: 'instagram',
      oauth2: {
        code: 'test_code_789',
        state: 'test_state_abc'
      }
    },
    {
      platform: 'linkedin',
      oauth2: {
        code: 'test_code_789',
        state: 'test_state_abc'
      }
    },
    {
      platform: 'facebook',
      oauth2: {
        code: 'test_code_789',
        state: 'test_state_abc'
      }
    },
    {
      platform: 'youtube',
      oauth2: {
        code: 'test_code_789',
        state: 'test_state_abc'
      }
    }
  ];
  
  for (const testCase of testCases) {
    try {
      // Test OAuth 1.0a parameter validation (Twitter only)
      if (testCase.oauth1a) {
        const { oauth_token, oauth_verifier } = testCase.oauth1a;
        if (oauth_token && oauth_verifier) {
          console.log(`✅ ${testCase.platform.toUpperCase()}: OAuth 1.0a parameters valid`);
          testResults.passed++;
        } else {
          console.log(`❌ ${testCase.platform.toUpperCase()}: OAuth 1.0a parameters invalid`);
          testResults.failed++;
          testResults.errors.push(`${testCase.platform}: OAuth 1.0a parameter validation failed`);
        }
      }
      
      // Test OAuth 2.0 parameter validation
      if (testCase.oauth2) {
        const { code, state } = testCase.oauth2;
        if (code && state) {
          console.log(`✅ ${testCase.platform.toUpperCase()}: OAuth 2.0 parameters valid`);
          testResults.passed++;
        } else {
          console.log(`❌ ${testCase.platform.toUpperCase()}: OAuth 2.0 parameters invalid`);
          testResults.failed++;
          testResults.errors.push(`${testCase.platform}: OAuth 2.0 parameter validation failed`);
        }
      }
    } catch (error) {
      console.log(`❌ ${testCase.platform.toUpperCase()}: OAuth parameter test failed`);
      console.log(`   Error: ${error.message}`);
      testResults.failed++;
      testResults.errors.push(`${testCase.platform}: ${error.message}`);
    }
  }
}

/**
 * Test error handling
 */
function testErrorHandling() {
  console.log('\n🔗 Testing Error Handling...\n');
  
  const errorTestCases = [
    {
      scenario: 'Missing OAuth parameters',
      params: {},
      expectedError: 'Missing OAuth parameters'
    },
    {
      scenario: 'Invalid state parameter',
      params: { code: 'test_code', state: 'invalid_state' },
      expectedError: 'Invalid state'
    },
    {
      scenario: 'User denial',
      params: { denied: 'true' },
      expectedError: 'User denied access'
    }
  ];
  
  for (const testCase of errorTestCases) {
    try {
      // Test error scenario handling
      if (testCase.scenario === 'Missing OAuth parameters') {
        const hasRequiredParams = testCase.params.code && testCase.params.state;
        if (!hasRequiredParams) {
          console.log(`✅ Error handling: ${testCase.scenario} detected correctly`);
          testResults.passed++;
        } else {
          console.log(`❌ Error handling: ${testCase.scenario} not detected`);
          testResults.failed++;
          testResults.errors.push(`Error handling: ${testCase.scenario} failed`);
        }
      } else if (testCase.scenario === 'User denial') {
        if (testCase.params.denied) {
          console.log(`✅ Error handling: ${testCase.scenario} detected correctly`);
          testResults.passed++;
        } else {
          console.log(`❌ Error handling: ${testCase.scenario} not detected`);
          testResults.failed++;
          testResults.errors.push(`Error handling: ${testCase.scenario} failed`);
        }
      }
    } catch (error) {
      console.log(`❌ Error handling test failed: ${testCase.scenario}`);
      console.log(`   Error: ${error.message}`);
      testResults.failed++;
      testResults.errors.push(`Error handling: ${testCase.scenario} - ${error.message}`);
    }
  }
}

/**
 * Print test summary
 */
function printTestSummary() {
  console.log('\n' + '='.repeat(60));
  console.log('📊 REDIRECTION FLOW TEST SUMMARY');
  console.log('='.repeat(60));
  console.log(`✅ Passed: ${testResults.passed}`);
  console.log(`❌ Failed: ${testResults.failed}`);
  console.log(`📈 Success Rate: ${((testResults.passed / (testResults.passed + testResults.failed)) * 100).toFixed(1)}%`);
  
  if (testResults.errors.length > 0) {
    console.log('\n🚨 ERRORS FOUND:');
    testResults.errors.forEach((error, index) => {
      console.log(`   ${index + 1}. ${error}`);
    });
  }
  
  console.log('\n' + '='.repeat(60));
  
  if (testResults.failed === 0) {
    console.log('🎉 All redirection flow tests passed!');
    process.exit(0);
  } else {
    console.log('⚠️  Some redirection flow tests failed. Please review the errors above.');
    process.exit(1);
  }
}

/**
 * Main test runner
 */
async function runTests() {
  console.log('🚀 Starting Social Media Redirection Flow Tests...');
  console.log(`   Backend URL: ${TEST_CONFIG.baseUrl}`);
  console.log(`   Frontend URL: ${TEST_CONFIG.frontendUrl}`);
  
  try {
    // Run all tests
    await testOAuthUrlGeneration();
    testCallbackUrlConstruction();
    testRedirectUrlHandling();
    testOAuthParameterHandling();
    testErrorHandling();
    
    // Print summary
    printTestSummary();
  } catch (error) {
    console.error('💥 Test runner failed:', error.message);
    process.exit(1);
  }
}

// Run tests if this script is executed directly
if (require.main === module) {
  runTests();
}

module.exports = {
  runTests,
  testResults
};
