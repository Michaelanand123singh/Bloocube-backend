// Test Google authentication flow
require('dotenv').config();
const axios = require('axios');

const API_BASE = 'http://localhost:5000';

async function testGoogleAuth() {
  console.log('🔍 Testing Google Authentication Flow...\n');
  
  try {
    // Test 1: Generate Google Auth URL
    console.log('📋 Test 1: Generate Google Auth URL');
    console.log('Endpoint: POST /api/google/auth-url');
    
    const authResponse = await axios.post(`${API_BASE}/api/google/auth-url`, {
      redirectUri: 'http://localhost:3000/auth/google/callback'
    }, {
      headers: {
        'Content-Type': 'application/json'
      }
    });
    
    console.log('✅ Status:', authResponse.status);
    console.log('✅ Response:', {
      success: authResponse.data.success,
      hasAuthURL: !!authResponse.data.authURL,
      hasState: !!authResponse.data.state,
      redirectUri: authResponse.data.redirectUri
    });
    
    if (authResponse.data.authURL) {
      console.log('🔗 Auth URL:', authResponse.data.authURL.substring(0, 100) + '...');
    }
    
  } catch (error) {
    console.log('❌ FAILED - Status:', error.response?.status || 'No response');
    console.log('❌ Error:', error.response?.data || error.message);
  }
  
  console.log('\n' + '='.repeat(50));
  
  // Test 2: Test callback with invalid parameters
  console.log('📋 Test 2: Test callback with invalid parameters');
  console.log('Endpoint: GET /api/google/callback');
  
  try {
    const callbackResponse = await axios.get(`${API_BASE}/api/google/callback?code=invalid&state=invalid&redirectUri=http://localhost:3000/auth/google/callback`);
    console.log('✅ Status:', callbackResponse.status);
    console.log('✅ Response:', callbackResponse.data);
  } catch (error) {
    console.log('❌ FAILED - Status:', error.response?.status || 'No response');
    console.log('❌ Error:', error.response?.data || error.message);
  }
  
  console.log('\n' + '='.repeat(50));
  
  // Test 3: Check environment variables
  console.log('📋 Test 3: Check Google Environment Variables');
  console.log('GOOGLE_CLIENT_ID:', process.env.GOOGLE_CLIENT_ID ? 'SET' : 'NOT SET');
  console.log('GOOGLE_CLIENT_SECRET:', process.env.GOOGLE_CLIENT_SECRET ? 'SET' : 'NOT SET');
  console.log('GOOGLE_SCOPES:', process.env.GOOGLE_SCOPES || 'NOT SET');
  
  console.log('\n🎯 Google Authentication Test Complete');
}

testGoogleAuth().catch(console.error);
