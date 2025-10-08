// src/controllers/twitterController.js
const twitterService = require('../services/social/twitter');
const User = require('../models/User');
const jwt = require('jsonwebtoken');
const config = require('../config/env');

class TwitterController {
  // Generate Twitter OAuth URL
  async generateAuthURL(req, res) {
    try {
      console.log('🔑 Twitter generateAuthURL called:', {
        hasUser: !!req.user,
        userId: req.userId || req.user?._id,
        redirectUri: req.body?.redirectUri,
        method: req.method
      });

      const { redirectUri } = req.body;
      const state = jwt.sign(
        { userId: req.userId || req.user._id },
        config.JWT_SECRET,
        { expiresIn: '30m' }
      );

      const authURL = twitterService.generateAuthURL(redirectUri, state);

      console.log('✅ Twitter auth URL generated:', { hasAuthURL: !!authURL, state: state.substring(0, 20) + '...' });
      return res.json({ success: true, authURL, state, redirectUri });
    } catch (error) {
      console.error('❌ Twitter generateAuthURL error:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  }

  // Handle Twitter OAuth callback
  async handleCallback(req, res) {
    try {
      const { code, state, redirectUri } = req.query;
      const redirectToFrontend = config.FRONTEND_URL || 'http://localhost:3000';

      console.log("📥 Twitter Callback query params:", { code, state, redirectUri });

      if (!code || !state || !redirectUri) {
        const msg = 'Missing code, state or redirectUri';
        return res.redirect(`${redirectToFrontend}/creator/settings?twitter=error&message=${encodeURIComponent(msg)}`);
      }

      // Verify state
      let decodedState;
      try {
        decodedState = jwt.verify(state, config.JWT_SECRET);
        console.log("✅ Decoded state:", decodedState);
      } catch (error) {
        console.error("❌ Invalid state:", error);
        const msg = 'Invalid state';
        return res.redirect(`${redirectToFrontend}/creator/settings?twitter=error&message=${encodeURIComponent(msg)}`);
      }

      // Exchange code for token
      console.log("🔄 Exchanging code for token with redirectUri:", redirectUri);
      const tokenResult = await twitterService.exchangeCodeForToken(code, redirectUri, state);
      console.log("🔑 Twitter token result:", tokenResult);

      if (!tokenResult.success) {
        const detail = tokenResult.error || 'Token exchange failed';
        return res.redirect(`${redirectToFrontend}/creator/settings?twitter=error&message=${encodeURIComponent(String(detail))}`);
      }

      // Fetch Twitter profile
      let profileResult;
      try {
        profileResult = await twitterService.getProfile(tokenResult.access_token);
        console.log("👤 Twitter profile result:", profileResult);
      } catch (e) {
        console.log("👤 Twitter profile fetch threw:", e);
      }

      // Update DB
      await User.findByIdAndUpdate(
        decodedState.userId,
        {
          $set: {
            'socialAccounts.twitter.accessToken': tokenResult.access_token,
            'socialAccounts.twitter.refreshToken': tokenResult.refresh_token,
            'socialAccounts.twitter.expiresAt': new Date(Date.now() + tokenResult.expires_in * 1000),
            'socialAccounts.twitter.connectedAt': new Date(),
            ...(profileResult?.success && {
              'socialAccounts.twitter.id': profileResult.user.id,
              'socialAccounts.twitter.username': profileResult.user.username,
              'socialAccounts.twitter.name': profileResult.user.name,
              'socialAccounts.twitter.profileImageUrl': profileResult.user.profile_image_url
            })
          }
        },
        { upsert: true }
      );

      console.log("✅ Twitter user updated in DB");

      return res.redirect(`${redirectToFrontend}/creator/settings?twitter=success`);
    } catch (error) {
      console.error("🔥 Twitter callback error:", error);
      const redirectToFrontend = config.FRONTEND_URL || 'http://localhost:3000';
      const msg = error?.message || 'Callback failed';
      return res.redirect(`${redirectToFrontend}/creator/settings?twitter=error&message=${encodeURIComponent(String(msg))}`);
    }
  }

  // Disconnect Twitter account
  async disconnect(req, res) {
    try {
      const userId = req.user.id;

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
      result = await twitterService.postTweet(accessToken, content, mediaIds);

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
      const userId = req.user.id;
      const user = await User.findById(userId);

      if (!user || !user.socialAccounts?.twitter?.accessToken) {
        return res.status(400).json({ success: false, error: 'Twitter account not connected' });
      }

      if (!req.file) {
        return res.status(400).json({ success: false, error: 'No media file provided' });
      }

      const result = await twitterService.uploadMedia(user.socialAccounts.twitter.accessToken, req.file.buffer, req.file.mimetype);

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
      const userId = req.user.id;
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
      const userId = req.user.id;
      const user = await User.findById(userId);

      if (!user || !user.socialAccounts?.twitter) {
        return res.status(400).json({ success: false, error: 'Twitter account not connected' });
      }

      res.json({ success: true, profile: user.socialAccounts.twitter });
    } catch (error) {
      console.error('Twitter profile error:', error);
      res.status(500).json({ success: false, error: 'Failed to get Twitter profile' });
    }
  }
 


  // Validate Twitter connection
  async validateConnection(req, res) {
    try {
      const userId = req.user.id;
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