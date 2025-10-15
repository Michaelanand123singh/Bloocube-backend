const Post = require('../models/Post');
const User = require('../models/User');
const { validationResult } = require('express-validator');
const path = require('path');
const fs = require('fs'); // Must be imported for the local storage fallback
const { TwitterApi } = require('twitter-api-v2'); 
const { downloadToBufferFromGcs } = require('../utils/storage'); // <--- CRITICAL IMPORT
const config = require('../config/env');
const axios = require('axios');

// Import platform services
const twitterService = require('../services/social/twitter');
const youtubeService = require('../services/social/youtube');
const linkedinService = require('../services/social/linkedin');
const instagramService = require('../services/social/instagram');

class PostController {

  constructor() {
    // Bind methods to ensure 'this' context is preserved
    this.postToPlatform = this.postToPlatform.bind(this);
    this.postToTwitter = this.postToTwitter.bind(this);
    this.postToYouTube = this.postToYouTube.bind(this);
    this.postToLinkedIn = this.postToLinkedIn.bind(this);
    this.publishPostById = this.publishPostById.bind(this);
    this.publishPost = this.publishPost.bind(this);
    this.schedulePostById = this.schedulePostById.bind(this);
    this.schedulePost = this.schedulePost.bind(this);
    // REMOVED: this.processUploadedMedia = this.processUploadedMedia.bind(this); // This is no longer needed
    this.createPost = this.createPost.bind(this); // Already correctly bound
  }

  // Helper method to post to platform
  async postToPlatform(post, user) {
    try {
      console.log(`🚀 Posting to ${post.platform}:`, {
        postId: post._id,
        platform: post.platform,
        postType: post.post_type,
        userId: user._id,
        userEmail: user.email
      });

      let platformResult = { success: false, error: 'Platform not supported' };

      switch (post.platform) {
        case 'twitter':
          console.log('🐦 Calling Twitter posting...');
          platformResult = await this.postToTwitter(post, user);
          break;
        case 'youtube':
          console.log('📺 Calling YouTube posting...');
          platformResult = await this.postToYouTube(post, user);
          break;
        case 'instagram':
          console.log('📸 Calling Instagram posting...');
          platformResult = await this.postToInstagram(post, user);
          break;
        case 'linkedin':
          console.log('💼 Calling LinkedIn posting...');
          platformResult = await this.postToLinkedIn(post, user);
          break;
        case 'facebook':
          console.log('👥 Calling Facebook posting...');
          platformResult = await this.postToFacebook(post, user);
          break;
        default:
          console.log('❓ Unsupported platform:', post.platform);
          platformResult = { success: false, error: 'Unsupported platform' };
      }

      console.log(`📊 Platform posting result for ${post.platform}:`, platformResult);
      return platformResult;
    } catch (error) {
      console.error(`❌ Error posting to ${post.platform}:`, error);
      return {
        success: false,
        error: error.message || 'Platform posting failed'
      };
    }
  }

  // Enhanced Twitter posting with proper data extraction
// In src/controllers/postController.js

// In src/controllers/postController.js

async postToTwitter(post, user) {
  try {
    console.log('--- 🐦 DEBUGGING postToTwitter ---');
    
    // ✅ FIX: Check for the new OAuth 1.0a credentials
    if (!user.socialAccounts?.twitter?.oauth_accessToken || !user.socialAccounts?.twitter?.oauth_accessSecret) {
      console.log('❌ Twitter account not connected or missing OAuth 1.0a tokens for user:', user._id);
      return { success: false, error: 'Twitter account not connected' };
    }

    // ✅ FIX: Initialize the twitter-api-v2 client with the user's permanent tokens
    const client = new TwitterApi({
      appKey: config.TWITTER_APP_KEY,
      appSecret: config.TWITTER_APP_SECRET,
      accessToken: user.socialAccounts.twitter.oauth_accessToken,
      accessSecret: user.socialAccounts.twitter.oauth_accessSecret,
    });

    const mediaIds = [];
    if (post.media && post.media.length > 0) {
      console.log('📸 Starting media processing loop...');
      for (const mediaFile of post.media) {
        const mediaPath = path.join(__dirname, '..', '..', 'uploads', mediaFile.filename);
        if (!fs.existsSync(mediaPath)) {
          console.error(`❌ File not found at path: ${mediaPath}`);
          continue;
        }

        console.log(`📤 Uploading ${mediaFile.filename} to Twitter...`);
        
        // ✅ FIX: Use the client to upload media
        const mediaId = await client.v1.uploadMedia(mediaPath, { mimeType: mediaFile.mimeType });
        if (mediaId) {
          mediaIds.push(mediaId);
          console.log(`✅ Media uploaded successfully. Media ID: ${mediaId}`);
        }
      }
    }

    // Prepare tweet data
    const tweetData = { text: post.content?.caption || post.title || ' ' };
    if (mediaIds.length > 0) {
      tweetData.media = { media_ids: mediaIds };
    }

    console.log('🚀 Posting tweet with data:', tweetData);

    // ✅ FIX: Use the client to post the tweet using API v2
    const result = await client.v2.tweet(tweetData);

    console.log('🏁 Final result from Twitter:', result);
    return { success: true, tweet_id: result.data.id, text: result.data.text };

  } catch (error) {
    console.error('❌ CRITICAL ERROR in postToTwitter:', error);
    return { success: false, error: error.message || 'Failed to post to Twitter' };
  }
}


  // Post to YouTube
  async postToYouTube(post, user) {
    try {
      if (!user.socialAccounts?.youtube?.accessToken) {
        return {
          success: false,
          error: 'YouTube account not connected'
        };
      }

      // Check if token is expired and refresh if needed
      let accessToken = user.socialAccounts.youtube.accessToken;
      if (user.socialAccounts.youtube.expiresAt && user.socialAccounts.youtube.expiresAt < new Date()) {
        console.log('🔄 YouTube token expired, refreshing...');
        const refreshResult = await youtubeService.refreshToken(user.socialAccounts.youtube.refreshToken);
        if (refreshResult.success) {
          accessToken = refreshResult.access_token;
          // Update user's token
          await User.findByIdAndUpdate(user._id, {
            $set: {
              'socialAccounts.youtube.accessToken': refreshResult.access_token,
              'socialAccounts.youtube.refreshToken': refreshResult.refresh_token,
              'socialAccounts.youtube.expiresAt': new Date(Date.now() + refreshResult.expires_in * 1000)
            }
          });
          console.log('✅ YouTube token refreshed successfully');
        } else {
          return {
            success: false,
            error: 'Failed to refresh YouTube token'
          };
        }
      }

      // Check if there's a video file to upload
      if (!post.media || post.media.length === 0) {
        return {
          success: false,
          error: 'No video file found for YouTube upload'
        };
      }

      const videoFile = post.media.find(media => media.type === 'video');
      if (!videoFile) {
        return {
          success: false,
          error: 'No video file found in media'
        };
      }

      // Read the video file
      const fs = require('fs');
      const path = require('path');
      const videoPath = path.join(__dirname, '..', '..', 'uploads', videoFile.filename);
      const videoBuffer = fs.readFileSync(videoPath);

      // Get YouTube content from post
      const youtubeContent = post.platformContent?.youtube || {};
      const title = youtubeContent.title || post.title || 'Untitled Video';
      const description = youtubeContent.description || post.content?.caption || '';
      const tags = youtubeContent.tags || [];
      const desiredPrivacyStatus = youtubeContent.privacy_status || 'private'; // Get the desired status

      console.log('🎬 Uploading video to YouTube:', {
        title,
        description: description.substring(0, 100) + '...',
        tagsCount: tags.length,
        videoSize: videoBuffer.length,
        desiredPrivacyStatus // This log will now show 'public'
      });

      // Upload video to YouTube
      const uploadResult = await youtubeService.uploadVideo(
        accessToken,
        videoBuffer,
        title,
        description,
        tags,
        desiredPrivacyStatus // ✅ FIX: Pass the desiredPrivacyStatus directly
      );

      if (uploadResult.success) {
        console.log('✅ YouTube video uploaded successfully:', uploadResult.video_id);
        // ❌ REMOVED: The conditional privacy update call is no longer needed
        // because uploadVideo now correctly sets the privacy status from the start.

        return {
          success: true,
          video_id: uploadResult.video_id,
          title: uploadResult.title,
          url: `https://www.youtube.com/watch?v=${uploadResult.video_id}`
        };
      } else {
        console.error('❌ YouTube upload failed:', uploadResult.error);
        return {
          success: false,
          error: uploadResult.error || 'Failed to upload video to YouTube'
        };
      }
    } catch (error) {
      console.error('❌ YouTube posting error:', error);
      return {
        success: false,
        error: error.message || 'Failed to post to YouTube'
      };
    }
  }

  // Helper: get absolute URL for stored media
  getAbsoluteMediaUrl(relativeOrAbsoluteUrl) {
    if (!relativeOrAbsoluteUrl) return null;
    if (/^https?:\/\//i.test(relativeOrAbsoluteUrl)) return relativeOrAbsoluteUrl;
    const base = config.BASE_URL || `http://localhost:${config.PORT || 5000}`;
    return `${base}${relativeOrAbsoluteUrl.startsWith('/') ? '' : '/'}${relativeOrAbsoluteUrl}`;
  }

  // Post to Instagram via IG Graph API using stored page token and igAccountId
  async postToInstagram(post, user) {
    try {
      const ig = user.socialAccounts?.instagram || {};
      let accessToken = ig.accessToken;

      // If IG token missing, try to derive from connected Facebook user access token
      let igAccountId = ig.igAccountId;
      if (!accessToken || !igAccountId) {
        const fb = user.socialAccounts?.facebook;
        if (fb?.accessToken) {
          try {
            const pagesResp = await axios.get('https://graph.facebook.com/v18.0/me/accounts', {
              params: { access_token: fb.accessToken, fields: 'id,name,access_token,instagram_business_account{id,username,profile_picture_url}' }
            });
            const pages = pagesResp.data?.data || [];
            const withIg = pages.find(p => p.instagram_business_account?.id && p.access_token);
            if (withIg) {
              accessToken = withIg.access_token; // Page token is required for IG Graph posting
              igAccountId = withIg.instagram_business_account.id;
              // Persist for future posts
              try {
                await User.findByIdAndUpdate(user._id, {
                  $set: {
                    'socialAccounts.instagram.accessToken': accessToken,
                    'socialAccounts.instagram.igAccountId': igAccountId,
                    'socialAccounts.instagram.username': withIg.instagram_business_account.username,
                    'socialAccounts.instagram.connectedAt': new Date(),
                    'socialAccounts.instagram.isBasicDisplay': false
                  }
                });
              } catch {}
            }
          } catch (e) {
            // fall through to error below
          }
        }
      }
      if (!accessToken || !igAccountId) {
        return { success: false, error: 'Instagram account not connected. Please connect an Instagram Business account linked to a Facebook Page.' };
      }

      const caption = post.content?.caption || post.title || '';
      // Prefer explicitly provided platformContent, fallback to first image media
      let mediaUrl = post.platformContent?.instagram?.mediaUrl;
      if (!mediaUrl && Array.isArray(post.media) && post.media.length > 0) {
        const firstImage = post.media.find(m => m.type === 'image');
        if (firstImage?.url) mediaUrl = this.getAbsoluteMediaUrl(firstImage.url);
      }

      if (!mediaUrl) {
        return { success: false, error: 'No image URL found for Instagram post' };
      }

      const result = await instagramService.postContent(accessToken, igAccountId, { mediaUrl, caption });
      if (!result.success) {
        return { success: false, error: result.error || 'Failed to post to Instagram', raw: result.raw };
      }

      return { success: true, ig_media_id: result.id, type: 'image' };
    } catch (error) {
      return { success: false, error: error.message || 'Instagram posting failed' };
    }
  }

  // Post to Facebook Page feed/photos using page access token
  async postToFacebook(post, user) {
    try {
      const fb = user.socialAccounts?.facebook;
      if (!fb?.accessToken) {
        return { success: false, error: 'Facebook account not connected' };
      }

      // 1) Get user pages and select a page
      const pagesResp = await axios.get('https://graph.facebook.com/v18.0/me/accounts', {
        params: { access_token: fb.accessToken, fields: 'id,name,access_token' }
      });
      const pages = pagesResp.data?.data || [];
      if (pages.length === 0) {
        return { success: false, error: 'No Facebook Pages found for this user' };
      }

      // Allow explicit pageId via platformContent override
      const preferredPageId = post.platformContent?.facebook?.pageId;
      const page = preferredPageId ? pages.find(p => p.id === preferredPageId) : pages[0];
      if (!page) {
        return { success: false, error: 'Specified Facebook Page not found for this user' };
      }

      const pageAccessToken = page.access_token;
      const pageId = page.id;

      const message = post.content?.caption || post.title || '';
      // Select media if available
      let imageUrl = post.platformContent?.facebook?.imageUrl;
      if (!imageUrl && Array.isArray(post.media) && post.media.length > 0) {
        const firstImage = post.media.find(m => m.type === 'image');
        if (firstImage?.url) imageUrl = this.getAbsoluteMediaUrl(firstImage.url);
      }

      if (imageUrl) {
        const photoResp = await axios.post(`https://graph.facebook.com/v18.0/${pageId}/photos`, null, {
          params: { url: imageUrl, caption: message, access_token: pageAccessToken }
        });
        return { success: true, type: 'photo', post_id: photoResp.data?.post_id || photoResp.data?.id, pageId };
      }

      const feedResp = await axios.post(`https://graph.facebook.com/v18.0/${pageId}/feed`, null, {
        params: { message, access_token: pageAccessToken }
      });
      return { success: true, type: 'feed', post_id: feedResp.data?.id, pageId };
    } catch (error) {
      const api = error.response?.data;
      return { success: false, error: api?.error?.message || error.message || 'Facebook posting failed', raw: api };
    }
  }

  // Post to LinkedIn
  async postToLinkedIn(post, user) {
    try {
      if (!user.socialAccounts?.linkedin?.accessToken) {
        return {
          success: false,
          error: 'LinkedIn account not connected'
        };
      }

      // Check if token is expired and refresh if needed
      let accessToken = user.socialAccounts.linkedin.accessToken;
      if (user.socialAccounts.linkedin.expiresAt && user.socialAccounts.linkedin.expiresAt < new Date()) {
        console.log('🔄 LinkedIn token expired, refreshing...');
        const refreshResult = await linkedinService.refreshToken(user.socialAccounts.linkedin.refreshToken);
        if (refreshResult.success) {
          accessToken = refreshResult.access_token;
          // Update user's token
          await User.findByIdAndUpdate(user._id, {
            $set: {
              'socialAccounts.linkedin.accessToken': refreshResult.access_token,
              'socialAccounts.linkedin.refreshToken': refreshResult.refresh_token,
              'socialAccounts.linkedin.expiresAt': new Date(Date.now() + refreshResult.expires_in * 1000)
            }
          });
          console.log('✅ LinkedIn token refreshed successfully');
        } else {
          return {
            success: false,
            error: 'Failed to refresh LinkedIn token'
          };
        }
      }

      // Get content for LinkedIn post
      const content = post.content?.caption || post.title || 'Shared via Bloocube';
      const linkedinContent = post.platformContent?.linkedin || {};

      console.log('💼 Posting to LinkedIn:', {
        contentLength: content.length,
        hasMedia: !!(post.media && post.media.length > 0)
      });
      const authorId = user.socialAccounts?.linkedin?.id;
      if (!authorId) {
        return { success: false, error: 'LinkedIn user ID not found.' };
      }
      const authorUrn = `urn:li:person:${authorId}`;
    let mediaPayload = null;
    if (post.media && post.media.length > 0) {
      const mediaFile = post.media[0];
      const mediaPath = path.join(__dirname, '..', '..', 'uploads', mediaFile.filename);
      if (fs.existsSync(mediaPath)) {
        mediaPayload = {
          buffer: fs.readFileSync(mediaPath), // Read file into a buffer
          type: mediaFile.mimeType,
        };
      }
    }

      // Prepare LinkedIn post payload
      const payload = {
        text: post.content?.caption || post.title || ' ',
        authorId: authorUrn,
        media: mediaPayload, // Pass the media object with the buffer
      };

      // Post to LinkedIn
      const result = await linkedinService.post(accessToken, payload);

      if (result.success) {
        console.log('✅ LinkedIn post successful:', result.post_id);
        return {
          success: true,
          post_id: result.post_id,
          text: result.text,
          platform: 'linkedin'
        };
      } else {
        console.error('❌ LinkedIn post failed:', result.error);
        return {
          success: false,
          error: result.error || 'Failed to post to LinkedIn'
        };
      }
    } catch (error) {
      console.error('❌ LinkedIn posting error:', error);
      return {
        success: false,
        error: error.message || 'Failed to post to LinkedIn'
      };
    }
  }

  // Debug middleware for post data
  debugPostData(req, res, next) {
    console.log('🔍 DEBUG - Incoming Post Data:', {
      body: req.body,
      platform: req.body.platform,
      post_type: req.body.post_type,
      platform_content: req.body.platform_content,
      content: req.body.content,
      files: req.files?.length || 0
    });
    next();
  }


  


  // Create a new post
  async createPost(req, res) {

    try {
      console.log('📝 Creating new post:', {
        body: req.body,
        files: req.files?.length || 0,
        userId: req.user?._id
      });

      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          message: 'Validation failed',
          errors: errors.array()
        });
      }

      const {
        title,
        content,
        platform,
        post_type,
        // status is forced to 'draft' here for createPost
        scheduledAt, // Used in `schedulePost`
        platformContent,
        tags,
        categories
      } = req.body;

      // Force status to 'draft' for regular post creation.
      // Posts should be published/scheduled via specific endpoints.
      const postStatus = 'draft';

      // Parse JSON strings if they exist
      let parsedPlatformContent = {};
      let parsedTags = [];
      let parsedCategories = [];

      try {
        if (platformContent) {
          parsedPlatformContent = typeof platformContent === 'string'
            ? JSON.parse(platformContent)
            : platformContent;
        }
        if (tags) {
          parsedTags = typeof tags === 'string'
            ? JSON.parse(tags)
            : Array.isArray(tags) ? tags : tags.split(',').map(t => t.trim());
        }
        if (categories) {
          parsedCategories = typeof categories === 'string'
            ? JSON.parse(categories)
            : Array.isArray(categories) ? categories : categories.split(',').map(c => c.trim());
        }
      } catch (parseError) {
        console.error('Error parsing JSON fields:', parseError);
        return res.status(400).json({
          success: false,
          message: 'Invalid JSON in request data'
        });
      }

      // ❌ REMOVED: const mediaFiles = this.processUploadedMedia(req); // No longer needed
      // The `req.files` array is now already processed and formatted by `persistUploads` middleware.

      let parsedContent = {};
      if (content) {
        if (typeof content === 'string') {
          if (content === '[object Object]') {
            parsedContent = { caption: title || 'No content provided' };
          } else {
            try {
              parsedContent = JSON.parse(content);
            } catch {
              parsedContent = { caption: content };
            }
          }
        } else if (typeof content === 'object') {
          parsedContent = content;
        }
      }


      console.log('📝 Content parsing result:', {
        originalContent: content,
        parsedContent: parsedContent,
        contentType: typeof content
      });

      const post = new Post({
        title,
        content: parsedContent,
        platform,
        post_type,
        author: req.user._id,
        status: postStatus,
        // The `scheduledAt` field is set through the `scheduling` subdocument
        // in the schema's pre-save hook, but for `createPost` (drafts), it's initially
        // not set unless explicitly passed.
        scheduledAt: scheduledAt ? new Date(scheduledAt) : undefined,
        platformContent: parsedPlatformContent,
        tags: parsedTags,
        categories: parsedCategories,
        media: req.files || [] // ✅ DIRECTLY use req.files (now correctly formatted by middleware)
      });

      await post.save();
      await post.populate('author', 'username email');

      console.log('✅ Post created successfully:', post._id);

      res.status(201).json({
        success: true,
        message: 'Post created successfully',
        post
      });

    } catch (error) {
      console.error('❌ Error creating post:', error);
      res.status(500).json({
        success: false,
        message: error.message || 'Failed to create post'
      });
    }
  }

  // Get posts (user's posts; admins can view all)
  async getUserPosts(req, res) {
    try {
      const {
        page = 1,
        limit = 10,
        status,
        search,
        platform,
        sort = '-createdAt'
      } = req.query;

      const query = {};
      // Scope by author for non-admins
      if (req.user?.role !== 'admin') {
        query.author = req.user._id;
      }

      if (status) query.status = status;
      if (platform) query.platform = platform;
      if (search) {
        query.$or = [
          { title: { $regex: search, $options: 'i' } },
          { content: { $regex: search, $options: 'i' } }
        ];
      }

      const pageNum = parseInt(page);
      const limitNum = parseInt(limit);
      const skip = (pageNum - 1) * limitNum;

      const [posts, total] = await Promise.all([
        Post.find(query)
          .sort(sort === 'recent' ? { createdAt: -1 } : sort === 'published' ? { published_at: -1 } : { lastEditedAt: -1, createdAt: -1 }) // Updated publishedAt sort to publishing.published_at
          .skip(skip)
          .limit(limitNum)
          .populate('author', 'name email role'),
        Post.countDocuments(query)
      ]);

      res.json({
        success: true,
        posts,
        pagination: {
          page: pageNum,
          limit: limitNum,
          total,
          pages: Math.ceil(total / limitNum)
        }
      });

    } catch (error) {
      console.error('❌ Error fetching posts:', error);
      res.status(500).json({
        success: false,
        message: error.message || 'Failed to fetch posts'
      });
    }
  }

  // Get a specific post (admins can access any post)
  async getPost(req, res) {
    try {
      const { id } = req.params;

      const baseQuery = { _id: id };
      if (req.user?.role !== 'admin') {
        baseQuery.author = req.user._id;
      }
      const post = await Post.findOne(baseQuery).populate('author', 'name email role');

      if (!post) {
        return res.status(404).json({
          success: false,
          message: 'Post not found'
        });
      }

      res.json({
        success: true,
        post
      });

    } catch (error) {
      console.error('❌ Error fetching post:', error);
      res.status(500).json({
        success: false,
        message: error.message || 'Failed to fetch post'
      });
    }
  }

  // Update a post
  async updatePost(req, res) {
    try {
      const { id } = req.params;
      const updateData = { ...req.body };

      // Parse JSON strings
      if (updateData.platformContent && typeof updateData.platformContent === 'string') {
        updateData.platformContent = JSON.parse(updateData.platformContent);
      }
      if (updateData.tags && typeof updateData.tags === 'string') {
        updateData.tags = JSON.parse(updateData.tags);
      }
      if (updateData.categories && typeof updateData.categories === 'string') {
        updateData.categories = JSON.parse(updateData.categories);
      }

      // If media files are present, they are already processed by `persistUploads`
      if (req.files && req.files.length > 0) {
        updateData.media = req.files; // Use the processed files
      }


      const post = await Post.findOneAndUpdate(
        { _id: id, author: req.user._id },
        { $set: updateData },
        { new: true }
      ).populate('author', 'username email');

      if (!post) {
        return res.status(404).json({
          success: false,
          message: 'Post not found'
        });
      }

      res.json({
        success: true,
        message: 'Post updated successfully',
        post
      });

    } catch (error) {
      console.error('❌ Error updating post:', error);
      res.status(500).json({
        success: false,
        message: error.message || 'Failed to update post'
      });
    }
  }

  // Delete a post
  async deletePost(req, res) {
    try {
      const { id } = req.params;

      const post = await Post.findOneAndDelete({
        _id: id,
        author: req.user._id
      });

      if (!post) {
        return res.status(404).json({
          success: false,
          message: 'Post not found'
        });
      }

      res.json({
        success: true,
        message: 'Post deleted successfully'
      });

    } catch (error) {
      console.error('❌ Error deleting post:', error);
      res.status(500).json({
        success: false,
        message: error.message || 'Failed to delete post'
      });
    }
  }

  // Get drafts
  async getDrafts(req, res) {
    try {
      const { page = 1, limit = 10 } = req.query;

      const pageNum = parseInt(page);
      const limitNum = parseInt(limit);
      const skip = (pageNum - 1) * limitNum;

      const [drafts, total] = await Promise.all([
        Post.find({
          author: req.user._id,
          status: 'draft'
        })
          .sort({ lastEditedAt: -1 })
          .skip(skip)
          .limit(limitNum)
          .populate('author', 'username email'),
        Post.countDocuments({
          author: req.user._id,
          status: 'draft'
        })
      ]);

      res.json({
        success: true,
        drafts,
        pagination: {
          page: pageNum,
          limit: limitNum,
          total,
          pages: Math.ceil(total / limitNum)
        }
      });

    } catch (error) {
      console.error('❌ Error fetching drafts:', error);
      res.status(500).json({
        success: false,
        message: error.message || 'Failed to fetch drafts'
      });
    }
  }

  // Get scheduled posts
  async getScheduled(req, res) {
    try {
      const { page = 1, limit = 10 } = req.query;

      const pageNum = parseInt(page);
      const limitNum = parseInt(limit);
      const skip = (pageNum - 1) * limitNum;

      const [scheduled, total] = await Promise.all([
        Post.find({
          author: req.user._id,
          status: 'scheduled'
        })
          .sort({ 'scheduling.scheduled_at': 1, createdAt: -1 })
          .skip(skip)
          .limit(limitNum)
          .populate('author', 'username email'),
        Post.countDocuments({
          author: req.user._id,
          status: 'scheduled'
        })
      ]);

      res.json({
        success: true,
        scheduled,
        pagination: {
          page: pageNum,
          limit: limitNum,
          total,
          pages: Math.ceil(total / limitNum)
        }
      });

    } catch (error) {
      console.error('❌ Error fetching scheduled posts:', error);
      res.status(500).json({
        success: false,
        message: error.message || 'Failed to fetch scheduled posts'
      });
    }
  }

  // Publish a post immediately
  async publishPost(req, res) {
    try {
      console.log('🚀 Publishing post immediately:', {
        body: req.body,
        files: req.files?.length || 0,
        userId: req.user?._id
      });

      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          message: 'Validation failed',
          errors: errors.array()
        });
      }


      const {
        title,
        content,
        platform,
        post_type,
        platformContent,
        tags,
        categories
      } = req.body;

      // Parse JSON strings if they exist
      let parsedPlatformContent = {};
      let parsedTags = [];
      let parsedCategories = [];

      try {
        if (platformContent) {
          parsedPlatformContent = typeof platformContent === 'string'
            ? JSON.parse(platformContent)
            : platformContent;
        }
        if (tags) {
          parsedTags = typeof tags === 'string'
            ? JSON.parse(tags)
            : Array.isArray(tags) ? tags : tags.split(',').map(t => t.trim());
        }
        if (categories) {
          parsedCategories = typeof categories === 'string'
            ? JSON.parse(categories)
            : Array.isArray(categories) ? categories : categories.split(',').map(c => c.trim());
        }
      } catch (parseError) {
        console.error('Error parsing JSON fields:', parseError);
        return res.status(400).json({
          success: false,
          message: 'Invalid JSON in request data'
        });
      }

      // ❌ REMOVED: const mediaFiles = this.processUploadedMedia(req); // No longer needed

      // Create post with published status
      const post = new Post({
        title,
        content,
        platform,
        post_type,
        author: req.user._id,
        status: 'published',
        platformContent: parsedPlatformContent,
        tags: parsedTags,
        categories: parsedCategories,
        media: req.files || [], // ✅ DIRECTLY use req.files (now correctly formatted by middleware)
        publishing: {
          published_at: new Date(),
          platform_post_id: null // Will be updated after successful platform posting
        }
      });

      await post.save();
      await post.populate('author', 'username email');

      // Post to platform
      console.log('🚀 Attempting to post to platform:', post.platform);
      const platformResult = await this.postToPlatform(post, req.user);

      if (!platformResult.success) {
        // Update post status to failed
        post.status = 'failed';
        post.publishing = {
          published_at: new Date(),
          platform_post_id: null,
          error: platformResult.error
        };
        await post.save();

        return res.status(400).json({
          success: false,
          message: `Failed to post to ${post.platform}: ${platformResult.error}`,
          platformError: platformResult.error,
          post
        });
      }

      // Update post with platform post ID
      post.publishing = {
        published_at: new Date(),
        platform_post_id: platformResult.tweet_id || platformResult.thread_id || platformResult.video_id || null,
        platform_data: platformResult
      };
      await post.save();

      console.log('✅ Post published successfully:', post._id, 'Platform ID:', post.publishing.platform_post_id);

      res.status(201).json({
        success: true,
        message: 'Post published successfully',
        post,
        platformResult
      });

    } catch (error) {
      console.error('❌ Error publishing post:', error);
      res.status(500).json({
        success: false,
        message: error.message || 'Failed to publish post'
      });
    }
  }

  // Schedule a post for later
  async schedulePost(req, res) {
    try {
      console.log('⏰ Scheduling post:', {
        body: req.body,
        files: req.files?.length || 0,
        userId: req.user?._id
      });

      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          message: 'Validation failed',
          errors: errors.array()
        });
      }

      const {
        title,
        content,
        platform,
        post_type,
        scheduledAt,
        scheduled_for,
        platformContent,
        tags,
        categories
      } = req.body;

      // Parse JSON strings if they exist
      let parsedPlatformContent = {};
      let parsedTags = [];
      let parsedCategories = [];

      try {
        if (platformContent) {
          parsedPlatformContent = typeof platformContent === 'string'
            ? JSON.parse(platformContent)
            : platformContent;
        }
        if (tags) {
          parsedTags = typeof tags === 'string'
            ? JSON.parse(tags)
            : Array.isArray(tags) ? tags : tags.split(',').map(t => t.trim());
        }
        if (categories) {
          parsedCategories = typeof categories === 'string'
            ? JSON.parse(categories)
            : Array.isArray(categories) ? categories : categories.split(',').map(c => c.trim());
        }
      } catch (parseError) {
        console.error('Error parsing JSON fields:', parseError);
        return res.status(400).json({
          success: false,
          message: 'Invalid JSON in request data'
        });
      }

      // ❌ REMOVED: const mediaFiles = this.processUploadedMedia(req); // No longer needed

      // Normalize scheduled date from any accepted key
      const incomingScheduled = scheduledAt || req.body?.scheduling?.scheduled_at || scheduled_for;
      const scheduledDate = new Date(incomingScheduled);
      if (!incomingScheduled || isNaN(scheduledDate.valueOf())) {
        return res.status(400).json({
          success: false,
          message: 'Valid scheduledAt is required (ISO 8601)'
        });
      }

      // Create post with scheduled status
      const post = new Post({
        title,
        content,
        platform,
        post_type,
        author: req.user._id,
        status: 'scheduled',
        // The `scheduledAt` field is deprecated in favor of `scheduling.scheduled_at`
        // but keeping it for now if other parts of the app rely on it.
        scheduledAt: scheduledDate,
        platformContent: parsedPlatformContent,
        tags: parsedTags,
        categories: parsedCategories,
        media: req.files || [], // ✅ DIRECTLY use req.files (now correctly formatted by middleware)
        scheduling: {
          scheduled_at: scheduledDate, // Corrected to match schema
          timezone: req.body.timezone || 'UTC'
        }
      });

      await post.save();
      await post.populate('author', 'username email');

      // TODO: Add job scheduling logic here (e.g., using node-cron or Bull queue)
      console.log('✅ Post scheduled successfully:', post._id, 'for:', scheduledDate.toISOString());

      res.status(201).json({
        success: true,
        message: 'Post scheduled successfully',
        post
      });

    } catch (error) {
      console.error('❌ Error scheduling post:', error);
      res.status(500).json({
        success: false,
        message: error.message || 'Failed to schedule post'
      });
    }
  }

  // Publish an existing post by ID
  async publishPostById(req, res) {
    try {
      const { id } = req.params;
      const userId = req.user._id;

      console.log('🚀 Publishing existing post:', { postId: id, userId });

      // Find the post and verify ownership
      const post = await Post.findOne({ _id: id, author: userId });

      if (!post) {
        return res.status(404).json({
          success: false,
          message: 'Post not found or you do not have permission to publish it'
        });
      }

      // Check if post is already published
      if (post.status === 'published') {
        return res.status(200).json({
          success: true,
          message: 'Post is already published',
          post: post,
          alreadyPublished: true
        });
      }

      // Get user with social accounts
      const user = await User.findById(userId);
      if (!user) {
        return res.status(404).json({
          success: false,
          message: 'User not found'
        });
      }

      // Post to platform first
      console.log('🚀 Attempting to post to platform:', post.platform);
      const platformResult = await this.postToPlatform(post, user);

      if (!platformResult.success) {
        // Update post status to failed
        post.status = 'failed';
        post.publishing = {
          published_at: new Date(),
          platform_post_id: null,
          error: platformResult.error
        };
        await post.save();

        return res.status(400).json({
          success: false,
          message: `Failed to post to ${post.platform}: ${platformResult.error}`,
          platformError: platformResult.error
        });
      }

      // Update post status to published with platform post ID
      post.status = 'published';
      post.publishing = {
        published_at: new Date(),
        platform_post_id: platformResult.tweet_id || platformResult.thread_id || platformResult.video_id || null,
        platform_data: platformResult
      };

      await post.save();
      await post.populate('author', 'username email');

      console.log('✅ Post published successfully:', post._id, 'Platform ID:', post.publishing.platform_post_id);

      res.json({
        success: true,
        message: 'Post published successfully',
        post,
        platformResult
      });

    } catch (error) {
      console.error('❌ Error publishing post:', error);
      res.status(500).json({
        success: false,
        message: error.message || 'Failed to publish post'
      });
    }
  }

  // Schedule an existing post by ID
  async schedulePostById(req, res) {
    try {
      const { id } = req.params;
      const { scheduledAt, scheduled_for, timezone } = req.body;
      const userId = req.user._id;

      // Validate request
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          message: 'Validation failed',
          errors: errors.array()
        });
      }

      // Accept either scheduledAt or scheduling.scheduled_at
      const incomingScheduled = scheduledAt || req.body?.scheduling?.scheduled_at || scheduled_for;
      const scheduledDate = new Date(incomingScheduled);
      if (!incomingScheduled || isNaN(scheduledDate.valueOf())) {
        return res.status(400).json({
          success: false,
          message: 'Valid scheduledAt is required (ISO 8601)'
        });
      }

      console.log('⏰ Scheduling existing post:', { postId: id, userId, scheduledAt: incomingScheduled });

      // Find the post and verify ownership
      const post = await Post.findOne({ _id: id, author: userId });

      if (!post) {
        return res.status(404).json({
          success: false,
          message: 'Post not found or you do not have permission to schedule it'
        });
      }

      // Check if post is already published
      if (post.status === 'published') {
        return res.status(200).json({
          success: true,
          message: 'Post is already published and cannot be scheduled',
          post: post,
          alreadyPublished: true
        });
      }

      // Check if post is already scheduled
      if (post.status === 'scheduled') {
        return res.status(200).json({
          success: true,
          message: 'Post is already scheduled',
          post: post,
          alreadyScheduled: true
        });
      }

      // Update post status to scheduled
      post.status = 'scheduled';
      // The `scheduledAt` field is deprecated in favor of `scheduling.scheduled_at`
      post.scheduledAt = scheduledDate;
      post.scheduling = {
        scheduled_at: scheduledDate, // Corrected to match schema
        timezone: timezone || 'UTC'
      };

      await post.save();
      await post.populate('author', 'username email');

      console.log('✅ Post scheduled successfully:', post._id, 'for:', scheduledDate.toISOString());

      res.json({
        success: true,
        message: 'Post scheduled successfully',
        post
      });

    } catch (error) {
      console.error('❌ Error scheduling post:', error);
      res.status(500).json({
        success: false,
        message: error.message || 'Failed to schedule post'
      });
    }
  }

  // Test Twitter connection
  async testTwitterConnection(req, res) {
    try {
      const userId = req.user._id;
      console.log('🔍 Testing Twitter connection for user:', userId);

      const user = await User.findById(userId);

      if (!user) {
        return res.status(404).json({
          success: false,
          error: 'User not found'
        });
      }

      if (!user.socialAccounts?.twitter?.accessToken) {
        return res.json({
          success: false,
          error: 'Twitter account not connected',
          hasTwitterAccount: false,
          socialAccounts: user.socialAccounts
        });
      }

      console.log('🐦 Twitter account found, testing API...');

      // Test Twitter API call
      try {
        const result = await twitterService.getProfile(user.socialAccounts.twitter.accessToken);

        res.json({
          success: true,
          twitterConnected: true,
          profile: result.user,
          tokenExpiresAt: user.socialAccounts.twitter.expiresAt,
          tokenValid: new Date(user.socialAccounts.twitter.expiresAt) > new Date()
        });
      } catch (error) {
        console.log('❌ Twitter API test failed:', error.message);
        res.json({
          success: false,
          error: error.message,
          twitterConnected: false,
          tokenExpiresAt: user.socialAccounts.twitter.expiresAt,
          tokenValid: new Date(user.socialAccounts.twitter.expiresAt) > new Date()
        });
      }
    } catch (error) {
      console.error('❌ Error testing Twitter connection:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to test Twitter connection'
      });
    }
  }

  // Validate content
  async validateContent(req, res) {
    try {
      const { content, platforms = [] } = req.body;

      const validation = {
        isValid: true,
        errors: [],
        warnings: [],
        suggestions: []
      };

      if (!content || content.trim().length === 0) {
        validation.isValid = false;
        validation.errors.push('Content cannot be empty');
      }

      // Platform-specific validation
      for (const platform of platforms) {
        switch (platform) {
          case 'twitter':
            if (content.length > 280) {
              validation.errors.push('Twitter content exceeds 280 characters');
              validation.isValid = false;
            }
            break;
          case 'linkedin':
            if (content.length > 3000) {
              validation.warnings.push('LinkedIn posts over 3000 characters may be truncated');
            }
            break;
          case 'youtube':
            if (content.length > 5000) {
              validation.warnings.push('YouTube descriptions over 5000 characters may be truncated');
            }
            break;
        }
      }

      res.json({
        success: true,
        validation
      });

    } catch (error) {
      console.error('❌ Error validating content:', error);
      res.status(500).json({
        success: false,
        message: error.message || 'Failed to validate content'
      });
    }
  }
}

module.exports = new PostController();