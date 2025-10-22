// Debug Google callback flow
require('dotenv').config();
const jwtManager = require('./src/utils/jwt');

async function debugGoogleCallback() {
  console.log('🔍 Debugging Google Callback Flow...\n');
  
  try {
    // Test JWT generation
    console.log('📋 Test 1: JWT Token Generation');
    const testUser = { _id: '507f1f77bcf86cd799439011', email: 'test@example.com', role: 'creator' };
    const tokenPair = jwtManager.generateTokenPair({ id: testUser._id, email: testUser.email, role: testUser.role });
    
    console.log('✅ JWT Generation successful');
    console.log('- Access Token type:', typeof tokenPair.accessToken);
    console.log('- Refresh Token type:', typeof tokenPair.refreshToken);
    console.log('- Access Token length:', tokenPair.accessToken?.length || 'undefined');
    
    // Test token decoding (like frontend does)
    console.log('\n📋 Test 2: Token Decoding (Frontend Method)');
    try {
      const payload = JSON.parse(Buffer.from(tokenPair.accessToken.split('.')[1], 'base64').toString());
      console.log('✅ Token decoding successful');
      console.log('- Payload:', payload);
      console.log('- Has ID:', !!payload.id);
      console.log('- Has Email:', !!payload.email);
    } catch (decodeError) {
      console.log('❌ Token decoding failed:', decodeError.message);
    }
    
    // Test URL construction
    console.log('\n📋 Test 3: URL Construction');
    const redirectBase = 'http://localhost:3000';
    const successURL = `${redirectBase}/auth/google/callback?google=success&token=${encodeURIComponent(tokenPair.accessToken)}&message=${encodeURIComponent('Google+login+successful')}`;
    console.log('✅ Success URL constructed');
    console.log('- URL:', successURL);
    
  } catch (error) {
    console.error('❌ Error in debug:', error);
  }
}

debugGoogleCallback();
