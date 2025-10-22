#!/usr/bin/env node

/**
 * Social Media Credentials Setup Script
 * This script helps set up environment variables for social media platforms
 */

const fs = require('fs');
const path = require('path');
const readline = require('readline');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

// Platform configurations
const platforms = {
  twitter: {
    name: 'Twitter',
    envVars: [
      { key: 'TWITTER_APP_KEY', description: 'Twitter API Key' },
      { key: 'TWITTER_APP_SECRET', description: 'Twitter API Secret' },
      { key: 'TWITTER_CALLBACK_URL', description: 'Twitter OAuth Callback URL' }
    ],
    setupGuide: `
Twitter API Setup:
1. Go to https://developer.twitter.com/
2. Create a new app or use existing app
3. Go to "Keys and Tokens" tab
4. Copy "API Key" and "API Secret Key"
5. Set up OAuth 1.0a callback URL
    `
  },
  instagram: {
    name: 'Instagram',
    envVars: [
      { key: 'FACEBOOK_APP_ID', description: 'Facebook App ID (used for Instagram)' },
      { key: 'FACEBOOK_APP_SECRET', description: 'Facebook App Secret (used for Instagram)' },
      { key: 'INSTAGRAM_SCOPES', description: 'Instagram API Scopes' }
    ],
    setupGuide: `
Instagram API Setup:
1. Go to https://developers.facebook.com/
2. Create a new app
3. Add "Instagram Basic Display" product
4. Get App ID and App Secret
5. Set up Instagram Business Account
    `
  },
  linkedin: {
    name: 'LinkedIn',
    envVars: [
      { key: 'LINKEDIN_CLIENT_ID', description: 'LinkedIn Client ID' },
      { key: 'LINKEDIN_CLIENT_SECRET', description: 'LinkedIn Client Secret' },
      { key: 'LINKEDIN_SCOPES', description: 'LinkedIn API Scopes' }
    ],
    setupGuide: `
LinkedIn API Setup:
1. Go to https://www.linkedin.com/developers/
2. Create a new app
3. Get Client ID and Client Secret
4. Set up OAuth 2.0 redirect URL
    `
  },
  facebook: {
    name: 'Facebook',
    envVars: [
      { key: 'FACEBOOK_APP_ID', description: 'Facebook App ID' },
      { key: 'FACEBOOK_APP_SECRET', description: 'Facebook App Secret' }
    ],
    setupGuide: `
Facebook API Setup:
1. Go to https://developers.facebook.com/
2. Create a new app
3. Add "Facebook Login" product
4. Get App ID and App Secret
5. Set up OAuth redirect URL
    `
  },
  youtube: {
    name: 'YouTube',
    envVars: [
      { key: 'YOUTUBE_CLIENT_ID', description: 'YouTube Client ID' },
      { key: 'YOUTUBE_CLIENT_SECRET', description: 'YouTube Client Secret' },
      { key: 'YOUTUBE_API_KEY', description: 'YouTube API Key' },
      { key: 'YOUTUBE_SCOPES', description: 'YouTube API Scopes' }
    ],
    setupGuide: `
YouTube API Setup:
1. Go to https://console.cloud.google.com/
2. Enable YouTube Data API v3
3. Create OAuth 2.0 credentials
4. Get Client ID and Client Secret
5. Set up OAuth redirect URL
    `
  }
};

// Default values
const defaultValues = {
  TWITTER_CALLBACK_URL: 'https://yourdomain.com/api/twitter/callback',
  INSTAGRAM_SCOPES: 'pages_show_list,pages_read_engagement,instagram_basic,instagram_manage_insights,instagram_content_publish',
  LINKEDIN_SCOPES: 'openid profile email w_member_social',
  YOUTUBE_SCOPES: 'https://www.googleapis.com/auth/youtube.upload,https://www.googleapis.com/auth/youtube,https://www.googleapis.com/auth/youtube.readonly'
};

// Helper function to ask for input
function askQuestion(question) {
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      resolve(answer.trim());
    });
  });
}

// Helper function to check if env file exists
function checkEnvFile() {
  const envPath = path.join(__dirname, '..', 'env.production');
  return fs.existsSync(envPath);
}

// Helper function to read env file
function readEnvFile() {
  const envPath = path.join(__dirname, '..', 'env.production');
  if (!fs.existsSync(envPath)) {
    return {};
  }
  
  const content = fs.readFileSync(envPath, 'utf8');
  const envVars = {};
  
  content.split('\n').forEach(line => {
    const [key, ...valueParts] = line.split('=');
    if (key && valueParts.length > 0) {
      envVars[key.trim()] = valueParts.join('=').trim();
    }
  });
  
  return envVars;
}

// Helper function to write env file
function writeEnvFile(envVars) {
  const envPath = path.join(__dirname, '..', 'env.production');
  const content = Object.entries(envVars)
    .map(([key, value]) => `${key}=${value}`)
    .join('\n');
  
  fs.writeFileSync(envPath, content);
  console.log(`✅ Environment file updated: ${envPath}`);
}

// Main setup function
async function setupCredentials() {
  console.log('🚀 Social Media Credentials Setup');
  console.log('================================\n');
  
  // Check if env file exists
  const envExists = checkEnvFile();
  if (envExists) {
    console.log('📁 Found existing environment file');
    const overwrite = await askQuestion('Do you want to overwrite existing values? (y/N): ');
    if (overwrite.toLowerCase() !== 'y') {
      console.log('❌ Setup cancelled');
      rl.close();
      return;
    }
  }
  
  // Read existing env vars
  const existingEnvVars = readEnvFile();
  
  // Setup each platform
  for (const [platformKey, platform] of Object.entries(platforms)) {
    console.log(`\n🔧 Setting up ${platform.name}...`);
    console.log(platform.setupGuide);
    
    const setupPlatform = await askQuestion(`Do you want to set up ${platform.name}? (y/N): `);
    if (setupPlatform.toLowerCase() !== 'y') {
      console.log(`⏭️  Skipping ${platform.name}`);
      continue;
    }
    
    // Get credentials for each environment variable
    for (const envVar of platform.envVars) {
      const currentValue = existingEnvVars[envVar.key];
      const defaultValue = defaultValues[envVar.key] || '';
      
      let question = `Enter ${envVar.description}`;
      if (currentValue) {
        question += ` (current: ${currentValue.substring(0, 20)}...)`;
      }
      if (defaultValue) {
        question += ` (default: ${defaultValue})`;
      }
      question += ': ';
      
      const value = await askQuestion(question);
      if (value) {
        existingEnvVars[envVar.key] = value;
      } else if (defaultValue) {
        existingEnvVars[envVar.key] = defaultValue;
      }
    }
    
    console.log(`✅ ${platform.name} setup completed`);
  }
  
  // Write the updated env file
  writeEnvFile(existingEnvVars);
  
  console.log('\n🎉 Setup completed!');
  console.log('\n📋 Next steps:');
  console.log('1. Restart your backend server');
  console.log('2. Test the connections using: npm run test:social-connections');
  console.log('3. Verify OAuth flows in the frontend');
  
  rl.close();
}

// Run the setup
setupCredentials().catch(error => {
  console.error('💥 Setup error:', error);
  rl.close();
  process.exit(1);
});
