// Debug Twitter controller flow
require('dotenv').config();
const { TwitterApi } = require('twitter-api-v2');
const User = require('./src/models/User');
const config = require('./src/config/env');

async function debugTwitterController() {
  console.log('🔍 Debugging Twitter Controller Flow...');
  
  // Simulate the exact controller logic
  const appKey = config.TWITTER_APP_KEY;
  const appSecret = config.TWITTER_APP_SECRET;
  
  console.log('Config values:');
  console.log('- TWITTER_APP_KEY:', appKey ? `${appKey.substring(0, 10)}...` : 'NOT SET');
  console.log('- TWITTER_APP_SECRET:', appSecret ? `${appSecret.substring(0, 10)}...` : 'NOT SET');
  console.log('- FRONTEND_URL:', config.FRONTEND_URL);
  
  if (!appKey || !appSecret) {
    console.error('❌ Missing credentials in config');
    return;
  }
  
  try {
    // Simulate request object
    const mockReq = {
      body: { redirectUri: 'http://localhost:3000/auth/twitter/callback' },
      user: { _id: '507f1f77bcf86cd799439011' } // Test user ID
    };
    
    const redirectUri = mockReq.body?.redirectUri || mockReq.query?.redirectUri || 
      `${config.FRONTEND_URL || 'http://localhost:3000'}/auth/twitter/callback`;
    
    console.log('🔗 Using redirectUri:', redirectUri);
    
    const client = new TwitterApi({
      appKey: appKey,
      appSecret: appSecret,
    });
    
    console.log('✅ TwitterApi client created');
    
    const { url, oauth_token, oauth_token_secret } = await client.generateAuthLink(
      redirectUri,
      { linkMode: 'authorize' }
    );
    
    console.log('✅ generateAuthLink successful!');
    console.log('- URL:', url);
    console.log('- OAuth Token:', oauth_token.substring(0, 20) + '...');
    console.log('- OAuth Token Secret:', oauth_token_secret.substring(0, 20) + '...');
    
    // Test database update
    console.log('🗄️ Testing database update...');
    try {
      const result = await User.findByIdAndUpdate(mockReq.user._id, {
        'socialAccounts.twitter.oauth_token': oauth_token,
        'socialAccounts.twitter.oauth_token_secret': oauth_token_secret
      });
      console.log('✅ Database update successful:', result ? 'User found' : 'User not found');
    } catch (dbError) {
      console.error('❌ Database update failed:', dbError.message);
    }
    
  } catch (error) {
    console.error('❌ Error in controller flow:');
    console.error('- Message:', error.message);
    console.error('- Code:', error.code);
    console.error('- Status:', error.status);
    console.error('- Response:', error.response?.data);
    console.error('- Stack:', error.stack);
  }
}

debugTwitterController();
