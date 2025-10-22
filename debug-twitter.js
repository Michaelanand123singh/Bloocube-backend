// Debug Twitter API call
require('dotenv').config();
const { TwitterApi } = require('twitter-api-v2');

async function debugTwitter() {
  console.log('🔍 Debugging Twitter API...');
  
  const appKey = process.env.TWITTER_APP_KEY;
  const appSecret = process.env.TWITTER_APP_SECRET;
  
  console.log('Credentials:');
  console.log('- APP_KEY:', appKey ? `${appKey.substring(0, 10)}...` : 'NOT SET');
  console.log('- APP_SECRET:', appSecret ? `${appSecret.substring(0, 10)}...` : 'NOT SET');
  
  if (!appKey || !appSecret) {
    console.error('❌ Missing credentials');
    return;
  }
  
  try {
    const client = new TwitterApi({
      appKey: appKey,
      appSecret: appSecret,
    });
    
    console.log('✅ TwitterApi client created');
    
    const redirectUri = 'http://localhost:3000/auth/twitter/callback';
    console.log('🔗 Testing generateAuthLink with redirectUri:', redirectUri);
    
    const result = await client.generateAuthLink(redirectUri, { linkMode: 'authorize' });
    
    console.log('✅ Success!');
    console.log('- URL:', result.url);
    console.log('- OAuth Token:', result.oauth_token.substring(0, 20) + '...');
    console.log('- OAuth Token Secret:', result.oauth_token_secret.substring(0, 20) + '...');
    
  } catch (error) {
    console.error('❌ Error details:');
    console.error('- Message:', error.message);
    console.error('- Code:', error.code);
    console.error('- Status:', error.status);
    console.error('- Response:', error.response?.data);
    console.error('- Full error:', error);
  }
}

debugTwitter();
