// src/controllers/youtubeController.js
const youtubeService = require('../services/social/youtube');
const User = require('../models/User');
const jwt = require('jsonwebtoken');
const config = require('../config/env');

class YouTubeController {
  // Generate YouTube OAuth URL
  async generateAuthURL(req, res) {
    try {
      console.log('🔑 YouTube generateAuthURL called:', {
        hasUser: !!req.user,
        userId: req.userId || req.user?._id,
        redirectUri: req.body?.redirectUri,
        method: req.method
      });

      const { redirectUri } = req.body;
      const state = jwt.sign({ userId: req.userId || req.user._id }, config.JWT_SECRET, { expiresIn: '30m' });
    
      const authURL = youtubeService.generateAuthURL(redirectUri, state);
    
      console.log('✅ YouTube auth URL generated:', { hasAuthURL: !!authURL, state: state.substring(0, 20) + '...' });
      res.json({ success: true, authURL, state, redirectUri });
    } catch (error) {
      console.error('❌ YouTube generateAuthURL error:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  }

  // Handle YouTube OAuth callback
  async handleCallback(req, res) {
    try {
      const { code, state, redirectUri } = req.query;
      const redirectToFrontend = config.FRONTEND_URL || 'http://localhost:3000';

      console.log("📥 YouTube Callback query params:", { code, state, redirectUri });

      if (!code || !state || !redirectUri) {
        const msg = 'Missing code, state or redirectUri';
        return res.redirect(`${redirectToFrontend}/creator/settings?youtube=error&message=${encodeURIComponent(msg)}`);
      }

      // Verify state
      let decodedState;
      try {
        decodedState = jwt.verify(state, config.JWT_SECRET);
        console.log("✅ Decoded state:", decodedState);
      } catch (error) {
        console.error("❌ Invalid state:", error);
        const msg = 'Invalid state';
        return res.redirect(`${redirectToFrontend}/creator/settings?youtube=error&message=${encodeURIComponent(msg)}`);
      }

      // Exchange code for token
      console.log("🔄 Exchanging code for token with redirectUri:", redirectUri);
      const tokenResult = await youtubeService.exchangeCodeForToken(code, redirectUri, state);
      console.log("🔑 Token result:", tokenResult);

      if (!tokenResult.success) {
        const detail = tokenResult.raw?.error_description || tokenResult.raw?.detail || tokenResult.error || 'Token exchange failed';
        return res.redirect(`${redirectToFrontend}/creator/settings?youtube=error&message=${encodeURIComponent(String(detail))}`);
      }

      // Try to get channel info, but don't fail the connection if it errors
      let channelResult;
      try {
        channelResult = await youtubeService.getChannelInfo(tokenResult.access_token);
        console.log("📺 Channel result:", channelResult);
      } catch (e) {
        console.log("📺 Channel fetch threw:", e);
      }

      const youtubeChannel = channelResult?.success ? {
        id: channelResult.channel.id,
        title: channelResult.channel.title,
        description: channelResult.channel.description,
        customUrl: channelResult.channel.customUrl,
        thumbnails: channelResult.channel.thumbnails,
        subscriberCount: channelResult.channel.subscriberCount,
        videoCount: channelResult.channel.videoCount,
        viewCount: channelResult.channel.viewCount
      } : undefined;

      // Update DB (store tokens regardless; channel info if available)
      await User.findByIdAndUpdate(
        decodedState.userId,
        {
          $set: {
            'socialAccounts.youtube.accessToken': tokenResult.access_token,
            'socialAccounts.youtube.refreshToken': tokenResult.refresh_token,
            'socialAccounts.youtube.expiresAt': new Date(Date.now() + tokenResult.expires_in * 1000),
            'socialAccounts.youtube.connectedAt': new Date(),
            ...(youtubeChannel && {
              'socialAccounts.youtube.id': youtubeChannel.id,
              'socialAccounts.youtube.title': youtubeChannel.title,
              'socialAccounts.youtube.description': youtubeChannel.description,
              'socialAccounts.youtube.customUrl': youtubeChannel.customUrl,
              'socialAccounts.youtube.thumbnails': youtubeChannel.thumbnails,
              'socialAccounts.youtube.subscriberCount': youtubeChannel.subscriberCount,
              'socialAccounts.youtube.videoCount': youtubeChannel.videoCount,
              'socialAccounts.youtube.viewCount': youtubeChannel.viewCount
            })
          }
        },
        { upsert: true }
      );

      console.log("✅ User updated in DB");

      return res.redirect(`${redirectToFrontend}/creator/settings?youtube=success`);
    } catch (error) {
      console.error("🔥 YouTube callback error:", error);
      const redirectToFrontend = config.FRONTEND_URL || 'http://localhost:3000';
      const msg = error?.message || 'Callback failed';
      return res.redirect(`${redirectToFrontend}/creator/settings?youtube=error&message=${encodeURIComponent(String(msg))}`);
    }
  }

  // Disconnect YouTube account
  async disconnect(req, res) {
    try {
      const userId = req.user.id;
      
      const user = await User.findByIdAndUpdate(
        userId,
        {
          $unset: {
            'socialAccounts.youtube': 1
          }
        },
        { new: true }
      );

      if (!user) {
        return res.status(404).json({
          success: false,
          error: 'User not found'
        });
      }

      res.json({
        success: true,
        message: 'YouTube account disconnected successfully'
      });
    } catch (error) {
      console.error('YouTube disconnect error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to disconnect YouTube account'
      });
    }
  }

  // Get YouTube channel info
  async getChannelInfo(req, res) {
    try {
      const userId = req.user.id;
      console.log('🔍 YouTube channel check for user:', userId);
      
      const user = await User.findById(userId);
      
      if (!user) {
        console.log('❌ User not found:', userId);
        return res.status(404).json({
          success: false,
          error: 'User not found'
        });
      }
      
      if (!user.socialAccounts?.youtube) {
        console.log('❌ YouTube account not connected for user:', userId);
        return res.status(400).json({
          success: false,
          error: 'YouTube account not connected',
          code: 'YOUTUBE_NOT_CONNECTED'
        });
      }
      
      console.log('✅ YouTube account found for user:', userId, 'Token expires at:', user.socialAccounts.youtube.expiresAt);

      // Check if token is expired and refresh if needed
      let accessToken = user.socialAccounts.youtube.accessToken;
      const tokenExpiresAt = new Date(user.socialAccounts.youtube.expiresAt);
      const now = new Date();
      
      if (tokenExpiresAt < now) {
        console.log('🔄 YouTube token expired, refreshing...');
        const refreshResult = await youtubeService.refreshToken(user.socialAccounts.youtube.refreshToken);
        if (refreshResult.success) {
          accessToken = refreshResult.access_token;
          // Update user with new token
          await User.findByIdAndUpdate(userId, {
            $set: {
              'socialAccounts.youtube.accessToken': refreshResult.access_token,
              'socialAccounts.youtube.refreshToken': refreshResult.refresh_token || user.socialAccounts.youtube.refreshToken,
              'socialAccounts.youtube.expiresAt': new Date(Date.now() + refreshResult.expires_in * 1000)
            }
          });
          console.log('✅ YouTube token refreshed successfully');
        } else {
          console.log('❌ Failed to refresh YouTube token:', refreshResult.error);
          return res.status(400).json({
            success: false,
            error: 'Failed to refresh YouTube token. Please reconnect your YouTube account.',
            code: 'TOKEN_REFRESH_FAILED',
            details: refreshResult.error
          });
        }
      } else {
        console.log('✅ YouTube token is still valid');
      }

      // Get fresh channel info
      console.log('📺 Fetching YouTube channel info...');
      const channelResult = await youtubeService.getChannelInfo(accessToken);
      
      if (!channelResult.success) {
        console.log('❌ Failed to get YouTube channel info:', channelResult.error);
        return res.status(400).json({
          success: false,
          error: channelResult.error,
          code: 'CHANNEL_FETCH_FAILED'
        });
      }

      console.log('✅ YouTube channel info retrieved successfully');
      res.json({
        success: true,
        channel: channelResult.channel
      });
    } catch (error) {
      console.error('❌ YouTube channel info error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to get YouTube channel info',
        code: 'INTERNAL_ERROR'
      });
    }
  }

  // Upload video to YouTube
// Upload video to YouTube with improved error handling
async uploadVideo(req, res) {
  try {
    const { title, description, tags } = req.body;
    const userId = req.user.id;
    const user = await User.findById(userId);

    console.log('🎬 YouTube upload request:', {
      userId,
      hasFile: !!req.file,
      fileSize: req.file?.size,
      title,
      descriptionLength: description?.length
    });

    if (!user || !user.socialAccounts?.youtube?.accessToken) {
      return res.status(400).json({
        success: false,
        error: 'YouTube account not connected'
      });
    }

    if (!req.file) {
      return res.status(400).json({
        success: false,
        error: 'No video file provided'
      });
    }

    // Validate file size
    const maxSize = 100 * 1024 * 1024; // 100MB
    if (req.file.size > maxSize) {
      return res.status(400).json({
        success: false,
        error: `Video file too large. Maximum size is ${maxSize / (1024 * 1024)}MB`
      });
    }

    // Validate file type
    const allowedTypes = ['video/mp4', 'video/mov', 'video/avi', 'video/webm'];
    if (!allowedTypes.includes(req.file.mimetype)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid file type. Supported formats: MP4, MOV, AVI, WEBM'
      });
    }

    // Check if token is expired and refresh if needed
    let accessToken = user.socialAccounts.youtube.accessToken;
    if (user.socialAccounts.youtube.expiresAt < new Date()) {
      const refreshResult = await youtubeService.refreshToken(user.socialAccounts.youtube.refreshToken);
      if (refreshResult.success) {
        accessToken = refreshResult.access_token;
        await User.findByIdAndUpdate(userId, {
          $set: {
            'socialAccounts.youtube.accessToken': refreshResult.access_token,
            'socialAccounts.youtube.refreshToken': refreshResult.refresh_token,
            'socialAccounts.youtube.expiresAt': new Date(Date.now() + refreshResult.expires_in * 1000)
          }
        });
        console.log('✅ YouTube token refreshed for upload');
      } else {
        return res.status(400).json({
          success: false,
          error: 'Failed to refresh YouTube token'
        });
      }
    }

    // Choose upload method based on file size
    const tagsArray = tags ? tags.split(',').map(tag => tag.trim()).filter(tag => tag) : [];
    
    let result;
    if (req.file.size > 10 * 1024 * 1024) { // 10MB
      console.log('📦 Using resumable upload for large file');
      result = await youtubeService.uploadVideo(
        accessToken,
        req.file.buffer,
        title || 'Untitled Video',
        description || '',
        tagsArray
      );
    } else {
      console.log('📦 Using simple upload for small file');
      result = await youtubeService.uploadVideoSimple(
        accessToken,
        req.file.buffer,
        title || 'Untitled Video',
        description || '',
        tagsArray
      );
    }

    if (!result.success) {
      console.error('❌ YouTube upload failed:', result.error);
      return res.status(400).json({
        success: false,
        error: result.error,
        details: result.raw
      });
    }

    console.log('✅ YouTube upload successful:', result.video_id);
    res.json({
      success: true,
      message: 'Video uploaded to YouTube successfully',
      video: result
    });

  } catch (error) {
    console.error('❌ YouTube video upload error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to upload video to YouTube',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
}

  // Get video analytics
  async getVideoAnalytics(req, res) {
    try {
      const { videoId } = req.params;
      const userId = req.user.id;
      const user = await User.findById(userId);

      if (!user || !user.socialAccounts?.youtube?.accessToken) {
        return res.status(400).json({
          success: false,
          error: 'YouTube account not connected'
        });
      }

      // Check if token is expired and refresh if needed
      let accessToken = user.socialAccounts.youtube.accessToken;
      if (user.socialAccounts.youtube.expiresAt < new Date()) {
        const refreshResult = await youtubeService.refreshToken(user.socialAccounts.youtube.refreshToken);
        if (refreshResult.success) {
          accessToken = refreshResult.access_token;
          await User.findByIdAndUpdate(userId, {
            $set: {
              'socialAccounts.youtube.accessToken': refreshResult.access_token,
              'socialAccounts.youtube.refreshToken': refreshResult.refresh_token,
              'socialAccounts.youtube.expiresAt': new Date(Date.now() + refreshResult.expires_in * 1000)
            }
          });
        } else {
          return res.status(400).json({
            success: false,
            error: 'Failed to refresh YouTube token'
          });
        }
      }

      const result = await youtubeService.getVideoAnalytics(accessToken, videoId);

      if (!result.success) {
        return res.status(400).json({
          success: false,
          error: result.error
        });
      }

      res.json({
        success: true,
        analytics: result.analytics
      });
    } catch (error) {
      console.error('YouTube video analytics error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to get video analytics'
      });
    }
  }
}

module.exports = new YouTubeController();
