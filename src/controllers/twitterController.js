// src/controllers/twitterController.js
const twitterService = require('../services/social/twitter');
const { TwitterApi } = require('twitter-api-v2');

const User = require('../models/User');
const jwt = require('jsonwebtoken');
const config = require('../config/env');
const { getCreatorSettingsUrl, getCallbackUrl, buildRedirectUrl } = require('../utils/urlUtils');

class TwitterController {
  // Generate Twitter OAuth URL
  // ✅ NEW: Generate Twitter OAuth 1.0a URL
// In src/controllers/twitterController.js

async generateAuthURL(req, res) {
  try {
    // Check if Twitter credentials are configured
    if (!config.TWITTER_APP_KEY || !config.TWITTER_APP_SECRET) {
      return res.status(400).json({ 
        success: false, 
        error: 'Twitter API credentials not configured. Please set TWITTER_APP_KEY and TWITTER_APP_SECRET in environment variables.' 
      });
    }

    // Get redirectUri from request (POST body or GET query)
    const redirectUri = req.body?.redirectUri || req.query?.redirectUri || getCallbackUrl('twitter');

    const client = new TwitterApi({
      appKey: config.TWITTER_APP_KEY,
      appSecret: config.TWITTER_APP_SECRET,
    });
    
    console.log('🔍 Using Twitter Callback URL:', redirectUri);

    const { url, oauth_token, oauth_token_secret } = await client.generateAuthLink(
      redirectUri,
      { linkMode: 'authorize' }
    );

    console.log('🔑 Twitter OAuth 1.0a tokens generated:', {
      oauth_token: oauth_token.substring(0, 10) + '...',
      oauth_token_secret: oauth_token_secret.substring(0, 10) + '...'
    });

    // ✅ FIX: Save BOTH the token and the secret to identify the user on callback (if user is authenticated)
    const userId = req.userId || req.user?._id;
    if (userId) {
      await User.findByIdAndUpdate(userId, {
        'socialAccounts.twitter.oauth_token': oauth_token,
        'socialAccounts.twitter.oauth_token_secret': oauth_token_secret
      });
    }

    console.log('✅ Twitter OAuth 1.0a URL generated successfully');
    res.json({ success: true, authURL: url });
  } catch (error) {
    console.error('❌ Twitter generateAuthURL error:', error);
    
    // Handle specific Twitter API errors
    if (error.code === 403) {
      return res.status(403).json({ 
        success: false, 
        error: 'Twitter API access denied. Please check your API credentials and app permissions.',
        details: 'Make sure your Twitter app has the correct permissions and the API keys are valid.'
      });
    } else if (error.code === 401) {
      return res.status(401).json({ 
        success: false, 
        error: 'Twitter API authentication failed. Please check your API credentials.',
        details: 'Verify that TWITTER_APP_KEY and TWITTER_APP_SECRET are correct.'
      });
    }
    
    res.status(500).json({ 
      success: false, 
      error: error.message || 'Failed to generate Twitter OAuth URL',
      code: error.code
    });
  }
}

  // ✅ NEW: Handle Twitter OAuth 1.0a callback
 // In src/controllers/twitterController.js

async handleCallback(req, res) {
  const { oauth_token, oauth_verifier, code, state, redirectUri } = req.query;
  // For Twitter, we'll use the config fallback since we don't have redirectUri in state
  const redirectToFrontend = getCreatorSettingsUrl();

  try {
    // Handle OAuth 1.0a flow (primary)
    if (oauth_token && oauth_verifier) {
      // ✅ FIX: Find the user by the oauth_token from the callback URL
      console.log('🔍 Looking for user with oauth_token:', oauth_token.substring(0, 10) + '...');
      
      const user = await User.findOne({ 'socialAccounts.twitter.oauth_token': oauth_token });
      
      if (!user) {
        console.error('❌ User not found for oauth_token:', oauth_token.substring(0, 10) + '...');
        console.log('🔍 Available users with twitter tokens:', await User.find({ 'socialAccounts.twitter.oauth_token': { $exists: true } }).select('_id socialAccounts.twitter.oauth_token'));
        throw new Error('User not found or token is invalid. Please try connecting again.');
      }
      
      console.log('✅ User found:', user._id);
      
      const oauth_token_secret = user.socialAccounts.twitter.oauth_token_secret;

      if (!oauth_token || !oauth_verifier || !oauth_token_secret) {
        throw new Error('Callback parameters are missing or invalid.');
      }

      const client = new TwitterApi({
        appKey: config.TWITTER_APP_KEY,
        appSecret: config.TWITTER_APP_SECRET,
        accessToken: oauth_token,
        accessSecret: oauth_token_secret,
      });

      const { client: loggedClient, accessToken, accessSecret } = await client.login(oauth_verifier);
      const { data: userObject } = await loggedClient.v2.me({ 'user.fields': ['profile_image_url'] });

      // ✅ FIX: Use the user._id we found from the database
      await User.findByIdAndUpdate(user._id, {
        $set: {
          'socialAccounts.twitter.oauth_accessToken': accessToken,
          'socialAccounts.twitter.oauth_accessSecret': accessSecret,
          'socialAccounts.twitter.id': userObject.id,
          'socialAccounts.twitter.username': userObject.username,
          'socialAccounts.twitter.name': userObject.name,
          'socialAccounts.twitter.profileImageUrl': userObject.profile_image_url,
          'socialAccounts.twitter.connectedAt': new Date(),
        },
        // Clean up the temporary tokens
        $unset: {
          'socialAccounts.twitter.oauth_token': 1,
          'socialAccounts.twitter.oauth_token_secret': 1
        }
      });

      return res.redirect(buildRedirectUrl(redirectToFrontend, { twitter: 'success' }));
    }
    
    // Handle OAuth 2.0 flow (fallback)
    if (code && state) {
      // Verify state
      let decodedState;
      try {
        decodedState = jwt.verify(state, config.JWT_SECRET);
      } catch (error) {
        console.error("❌ Invalid state:", error);
        return res.redirect(buildRedirectUrl(redirectToFrontend, { twitter: 'error', message: 'Invalid state' }));
      }

      // Exchange code for token using OAuth 2.0
      const tokenResult = await twitterService.exchangeCodeForToken(code, redirectUri);
      
      if (!tokenResult.success) {
        const detail = tokenResult.error || 'Token exchange failed';
        return res.redirect(buildRedirectUrl(redirectToFrontend, { twitter: 'error', message: detail }));
      }

      // Get user profile
      const profileResult = await twitterService.getUserProfile(tokenResult.access_token);
      
      if (!profileResult.success) {
        const detail = profileResult.error || 'Profile fetch failed';
        return res.redirect(buildRedirectUrl(redirectToFrontend, { twitter: 'error', message: detail }));
      }

      // Update user's Twitter account
      await User.findByIdAndUpdate(decodedState.userId, {
        $set: {
          'socialAccounts.twitter.id': profileResult.user.id,
          'socialAccounts.twitter.username': profileResult.user.username,
          'socialAccounts.twitter.name': profileResult.user.name,
          'socialAccounts.twitter.profileImageUrl': profileResult.user.profile_image_url,
          'socialAccounts.twitter.accessToken': tokenResult.access_token,
          'socialAccounts.twitter.refreshToken': tokenResult.refresh_token || '',
          'socialAccounts.twitter.expiresAt': new Date(Date.now() + (tokenResult.expires_in * 1000)),
          'socialAccounts.twitter.connectedAt': new Date(),
        }
      });

      return res.redirect(buildRedirectUrl(redirectToFrontend, { twitter: 'success' }));
    }

    // No valid parameters
    throw new Error('Missing OAuth parameters');
  } catch (error) {
    console.error("🔥 Twitter callback error:", error);
    return res.redirect(buildRedirectUrl(redirectToFrontend, { twitter: 'error', message: error.message }));
  }
}

  // Disconnect Twitter account
  async disconnect(req, res) {
    try {
      const userId = req.userId;

      const user = await User.findByIdAndUpdate(
        userId,
        {
          $unset: { 'socialAccounts.twitter': 1 }
        },
        { new: true }
      );

      if (!user) {
        return res.status(404).json({ success: false, error: 'User not found' });
      }

      res.json({ success: true, message: 'Twitter account disconnected successfully' });
    } catch (error) {
      console.error('Twitter disconnect error:', error);
      res.status(500).json({ success: false, error: 'Failed to disconnect Twitter account' });
    }
  }

  // Post content to Twitter (Post / Thread / Poll)
// Enhanced post content method with better debugging
async postContent(req, res) {
  try {
    const { type, content, mediaIds, thread, poll, reply_settings } = req.body;
    const userId = req.user.id;
    
    console.log('📝 Twitter post request:', {
      userId,
      type,
      contentLength: content?.length,
      contentPreview: content?.substring(0, 50),
      mediaCount: mediaIds?.length,
      threadLength: thread?.length,
      hasPoll: !!poll,
      replySettings: reply_settings
    });

    const user = await User.findById(userId);
    
    if (!user || !user.socialAccounts?.twitter?.accessToken) {
      console.log('❌ Twitter account not connected for user:', userId);
      return res.status(400).json({ 
        success: false, 
        error: 'Twitter account not connected. Please connect your Twitter account first.' 
      });
    }

    // Enhanced token refresh with debugging
    let accessToken = user.socialAccounts.twitter.accessToken;
    const tokenExpiresAt = new Date(user.socialAccounts.twitter.expiresAt);
    const now = new Date();
    
    console.log('🔑 Token status:', {
      expiresAt: tokenExpiresAt,
      now: now,
      isExpired: tokenExpiresAt < now,
      tokenPreview: accessToken ? `${accessToken.substring(0, 10)}...` : 'No token'
    });

    if (tokenExpiresAt < now) {
      console.log('🔄 Twitter token expired, refreshing...');
      const refreshResult = await twitterService.refreshToken(user.socialAccounts.twitter.refreshToken);
      
      if (refreshResult.success) {
        accessToken = refreshResult.access_token;
        // Update user with new token
        await User.findByIdAndUpdate(userId, {
          $set: {
            'socialAccounts.twitter.accessToken': refreshResult.access_token,
            'socialAccounts.twitter.refreshToken': refreshResult.refresh_token,
            'socialAccounts.twitter.expiresAt': new Date(Date.now() + refreshResult.expires_in * 1000)
          }
        });
        console.log('✅ Twitter token refreshed successfully');
      } else {
        console.log('❌ Failed to refresh Twitter token:', refreshResult.error);
        return res.status(400).json({
          success: false,
          error: 'Failed to refresh Twitter token. Please reconnect your Twitter account.'
        });
      }
    }

    // Validate token can post
    console.log('🔍 Validating Twitter token permissions...');
    const validation = await twitterService.validateToken(accessToken);
    if (!validation.valid || !validation.canPost) {
      console.log('❌ Twitter token validation failed:', validation.error);
      return res.status(400).json({
        success: false,
        error: validation.error || 'Twitter account cannot post. Please check permissions.'
      });
    }
    console.log('✅ Twitter token validation passed');

    let result;

    // Handle different post types
    if (type === "post") {
      // Single tweet
      console.log('🐦 Posting single tweet...');
      result = await twitterService.postTweet(accessToken, content, {}, mediaIds);

    } else if (type === "thread") {
      // Thread of multiple tweets
      if (!Array.isArray(thread) || thread.length === 0) {
        return res.status(400).json({ 
          success: false, 
          error: 'Thread must contain at least one tweet' 
        });
      }
      
      console.log('🧵 Posting thread with', thread.length, 'tweets...');
      result = await twitterService.postThread(accessToken, thread);

    } else if (type === "poll") {
      // Poll with options and duration
      if (!poll?.options || poll.options.length < 2) {
        return res.status(400).json({ 
          success: false, 
          error: 'Poll must have at least 2 options' 
        });
      }
      if (!poll?.duration_minutes) {
        return res.status(400).json({ 
          success: false, 
          error: 'Poll duration required' 
        });
      }
      
      console.log('📊 Posting poll...', poll);
      result = await twitterService.postPoll(accessToken, content, poll);

    } else {
      return res.status(400).json({ 
        success: false, 
        error: 'Invalid post type. Use "post", "thread", or "poll"' 
      });
    }

    console.log('📊 Twitter API result:', result);

    if (!result.success) {
      return res.status(400).json({ 
        success: false, 
        error: result.error,
        details: result.raw 
      });
    }

    res.json({ 
      success: true, 
      message: 'Twitter content posted successfully', 
      data: result,
      tweet_url: `https://twitter.com/user/status/${result.tweet_id || result.thread_id}`
    });
    
  } catch (error) {
    console.error('❌ Twitter post error:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to post content to Twitter',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
}

  // Upload Media
  async uploadMedia(req, res) {
    try {
      const userId = req.userId;
      const user = await User.findById(userId);

      if (!user || !user.socialAccounts?.twitter) {
        return res.status(400).json({ success: false, error: 'Twitter account not connected' });
      }

      if (!req.file) {
        return res.status(400).json({ success: false, error: 'No media file provided' });
      }

      // Prefer OAuth 1.0a user tokens for media uploads (v1.1)
      const oauthAccessToken = user.socialAccounts.twitter.oauth_accessToken;
      const oauthAccessSecret = user.socialAccounts.twitter.oauth_accessSecret;

      if (!oauthAccessToken || !oauthAccessSecret) {
        return res.status(400).json({ success: false, error: 'Missing Twitter OAuth 1.0a credentials. Please reconnect Twitter.' });
      }

      const result = await twitterService.uploadMedia(
        oauthAccessToken,
        oauthAccessSecret,
        req.file.buffer,
        req.file.mimetype
      );

      if (!result.success) {
        return res.status(400).json({ success: false, error: result.error });
      }

      res.json({ success: true, mediaId: result.media_id });
    } catch (error) {
      console.error('Twitter media upload error:', error);
      res.status(500).json({ success: false, error: 'Failed to upload media' });
    }
  }

  // Check media processing status
  async checkMediaStatus(req, res) {
    try {
      const { mediaId } = req.params;
      const userId = req.userId;
      const user = await User.findById(userId);

      if (!user || !user.socialAccounts?.twitter?.accessToken) {
        return res.status(400).json({ success: false, error: 'Twitter account not connected' });
      }

      const result = await twitterService.checkMediaStatus(user.socialAccounts.twitter.accessToken, mediaId);

      if (!result.success) {
        return res.status(400).json({ success: false, error: result.error });
      }

      res.json({ success: true, ...result });
    } catch (error) {
      console.error('Twitter media status check error:', error);
      res.status(500).json({ success: false, error: 'Failed to check media status' });
    }
  }

  // Get Twitter profile
  async getProfile(req, res) {
    try {
      const userId = req.userId;
      const user = await User.findById(userId);

      if (!user || !user.socialAccounts?.twitter) {
        return res.status(400).json({ success: false, error: 'Twitter account not connected' });
      }

      // Prefer live validation via OAuth2 token when available (without posting)
      const tw = user.socialAccounts.twitter || {};
      let accessToken = tw.accessToken;
      const expiresAt = tw.expiresAt ? new Date(tw.expiresAt) : null;
      const now = new Date();

      if (accessToken) {
        // Refresh if expired or expiring soon (<=2m)
        if (expiresAt && (expiresAt.getTime() - now.getTime() < 2 * 60 * 1000)) {
          const refreshResult = await twitterService.refreshToken(tw.refreshToken);
          if (refreshResult?.success) {
            accessToken = refreshResult.access_token;
            await User.findByIdAndUpdate(userId, {
              $set: {
                'socialAccounts.twitter.accessToken': refreshResult.access_token,
                'socialAccounts.twitter.refreshToken': refreshResult.refresh_token || tw.refreshToken,
                'socialAccounts.twitter.expiresAt': new Date(Date.now() + (refreshResult.expires_in || 3600) * 1000)
              }
            });
          } else {
            // fall back to DB profile if refresh failed
            return res.json({ success: false, error: 'Twitter token expired' });
          }
        }

        // Live validate with a read-only profile fetch (no posting)
        const profileResult = await twitterService.getUserProfile(accessToken);
        if (profileResult?.success) {
          return res.json({ success: true, profile: { ...tw, ...profileResult.user } });
        }
        return res.json({ success: false, error: profileResult?.error || 'Failed to validate Twitter profile' });
      }

      // If only OAuth1.0a tokens exist, consider connected (they do not expire)
      if (tw.oauth_accessToken && tw.oauth_accessSecret) {
        return res.json({ success: true, profile: tw });
      }

      return res.json({ success: false, error: 'Twitter account not connected' });
    } catch (error) {
      console.error('Twitter profile error:', error);
      res.status(500).json({ success: false, error: 'Failed to get Twitter profile' });
    }
  }

  // Get Twitter connection status (with auto-refresh)
  async getStatus(req, res) {
    try {
      const userId = req.userId || req.user?._id || req.user?.id;
      const user = await User.findById(userId).select('socialAccounts.twitter');
      
      const twitterAccount = user?.socialAccounts?.twitter;
      
      // If no Twitter account or tokens, return disconnected
      if (!twitterAccount || (!twitterAccount.accessToken && !twitterAccount.oauth_accessToken)) {
        return res.json({ success: true, connected: false });
      }

      // If OAuth 1.0a tokens exist, they don't expire - consider connected
      if (twitterAccount.oauth_accessToken && twitterAccount.oauth_accessSecret) {
        return res.json({ success: true, connected: true });
      }

      // For OAuth 2.0 tokens, check expiration and refresh if needed
      let accessToken = twitterAccount.accessToken;
      const expiresAt = twitterAccount.expiresAt ? new Date(twitterAccount.expiresAt) : null;
      const now = new Date();

      // Refresh if expired or expiring within 2 minutes
      if (!accessToken || (expiresAt && expiresAt.getTime() - now.getTime() < 2 * 60 * 1000)) {
        if (twitterAccount.refreshToken) {
          console.log('🔄 Twitter token expired or expiring soon, refreshing...');
          const refreshResult = await twitterService.refreshToken(twitterAccount.refreshToken);
          if (refreshResult?.success) {
            accessToken = refreshResult.access_token;
            // Update tokens in database
            await User.findByIdAndUpdate(userId, {
              $set: {
                'socialAccounts.twitter.accessToken': refreshResult.access_token,
                'socialAccounts.twitter.refreshToken': refreshResult.refresh_token || twitterAccount.refreshToken,
                'socialAccounts.twitter.expiresAt': new Date(Date.now() + (refreshResult.expires_in || 3600) * 1000)
              }
            });
            console.log('✅ Twitter token refreshed successfully');
          } else {
            // Refresh failed → treat as disconnected but do not erase tokens automatically
            console.log('❌ Twitter token refresh failed:', refreshResult?.error);
            return res.json({ success: true, connected: false, expired: true });
          }
        } else {
          // No refresh token available
          return res.json({ success: true, connected: false, expired: true });
        }
      }

      // Lightweight live validation: try fetching profile info
      try {
        const profileResult = await twitterService.getUserProfile(accessToken);
        if (profileResult && profileResult.success) {
          return res.json({ 
            success: true, 
            connected: true,
            account: {
              id: twitterAccount.id,
              username: twitterAccount.username,
              name: twitterAccount.name,
              connectedAt: twitterAccount.connectedAt
            }
          });
        }
        return res.json({ success: true, connected: false });
      } catch (e) {
        console.error('Twitter profile validation error:', e);
        return res.json({ success: true, connected: false });
      }

    } catch (error) {
      console.error('Error getting Twitter status:', error);
      res.status(500).json({ 
        success: false, 
        error: 'Failed to get Twitter status',
        details: error.message 
      });
    }
  }

  // Validate Twitter connection
  async validateConnection(req, res) {
    try {
      const userId = req.userId;
      const user = await User.findById(userId);

      if (!user || !user.socialAccounts?.twitter?.accessToken) {
        return res.status(400).json({ success: false, error: 'Twitter account not connected' });
      }

      const validation = await twitterService.validateToken(user.socialAccounts.twitter.accessToken);

      if (!validation.valid) {
        return res.status(400).json({ success: false, error: validation.error });
      }

      res.json({ 
        success: true, 
        valid: true, 
        user: validation.user,
        canPost: validation.canPost
      });
    } catch (error) {
      console.error('Twitter validation error:', error);
      res.status(500).json({ success: false, error: 'Failed to validate Twitter connection' });
    }
  }
}

module.exports = new TwitterController();