// src/controllers/engagementController.js
const engagementService = require('../services/engagementService');
const User = require('../models/User');
const Post = require('../models/Post');
const { asyncHandler } = require('../middlewares/errorHandler');
const { HTTP_STATUS } = require('../utils/constants');

class EngagementController {
  /**
   * Get engagement metrics for a specific platform
   * GET /api/engagement/:platform
   */
  getPlatformEngagement = asyncHandler(async (req, res) => {
    const { platform } = req.params;
    const { postId } = req.query;
    const userId = req.userId;

    const user = await User.findById(userId);
    if (!user) {
      return res.status(HTTP_STATUS.NOT_FOUND).json({
        success: false,
        message: 'User not found'
      });
    }

    const result = await engagementService.getPlatformMetrics(user, platform, postId);

    if (result.success) {
      return res.status(HTTP_STATUS.OK).json({
        success: true,
        data: result
      });
    } else {
      return res.status(HTTP_STATUS.OK).json({
        success: false,
        comingSoon: result.comingSoon || false,
        message: result.message || result.error,
        data: result
      });
    }
  });

  /**
   * Get engagement metrics for all connected platforms
   * GET /api/engagement
   */
  getAllPlatformEngagement = asyncHandler(async (req, res) => {
    const userId = req.userId;

    const user = await User.findById(userId);
    if (!user) {
      return res.status(HTTP_STATUS.NOT_FOUND).json({
        success: false,
        message: 'User not found'
      });
    }

    const results = await engagementService.getAllPlatformMetrics(user);

    // Calculate overall engagement summary
    const summary = {
      totalLikes: 0,
      totalComments: 0,
      totalShares: 0,
      totalViews: 0,
      totalPosts: 0,
      platforms: Object.keys(results).filter(p => results[p].success)
    };

    Object.values(results).forEach(result => {
      if (result.success && result.metrics) {
        summary.totalLikes += result.metrics.likes || 0;
        summary.totalComments += result.metrics.comments || 0;
        summary.totalShares += result.metrics.shares || 0;
        summary.totalViews += result.metrics.views || 0;
        summary.totalPosts += result.metrics.posts || 0;
      }
    });

    return res.status(HTTP_STATUS.OK).json({
      success: true,
      data: {
        platforms: results,
        summary
      }
    });
  });

  /**
   * Get user's published posts with platform links
   * GET /api/engagement/posts
   */
  getUserPublishedPosts = asyncHandler(async (req, res) => {
    const userId = req.userId;
    const { platform, page = 1, limit = 20, includeMetrics = 'true' } = req.query;
    const shouldFetchMetrics = includeMetrics === 'true' || includeMetrics === true;

    const user = await User.findById(userId);
    if (!user) {
      return res.status(HTTP_STATUS.NOT_FOUND).json({
        success: false,
        message: 'User not found'
      });
    }

    const query = {
      author: userId,
      status: 'published',
      // Include all published posts, even if they don't have platform_post_id
      // This ensures LinkedIn/Facebook posts are included
      'publishing.published_at': { $exists: true }
    };

    if (platform) {
      query.platform = platform;
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const posts = await Post.find(query)
      .sort({ 'publishing.published_at': -1 })
      .skip(skip)
      .limit(parseInt(limit))
      .select('title content platform post_type publishing analytics createdAt');

    const total = await Post.countDocuments(query);

    // Enrich posts with platform URLs and metrics
    // Use Promise.allSettled to prevent one failed metric fetch from blocking others
    const enrichedPostsPromises = posts.map(async (post) => {
        let platformPostId = post.publishing?.platform_post_id;
        let platformUrl = post.publishing?.platform_url;

        // If no platform_post_id but post was published, try to extract from platform_data
        if (!platformPostId && post.publishing?.platform_data) {
          const platformData = post.publishing.platform_data;
          platformPostId = platformData.post_id || 
                           platformData.tweet_id || 
                           platformData.thread_id ||
                           platformData.video_id || 
                           platformData.ig_media_id || 
                           platformData.id;
        }

        // Generate URL if not stored
        if (!platformUrl && platformPostId) {
          const username = user.socialAccounts?.[post.platform]?.username || 
                          user.socialAccounts?.[post.platform]?.customUrl ||
                          user.socialAccounts?.[post.platform]?.id;
          platformUrl = engagementService.generatePlatformURL(
            post.platform,
            platformPostId,
            username
          );
        }

        // If still no URL but we have platform_post_id, try to generate it anyway
        if (!platformUrl && platformPostId) {
          platformUrl = engagementService.generatePlatformURL(
            post.platform,
            platformPostId,
            null
          );
        }

        // Get latest metrics if available (only for platforms that support it and if requested)
        // Skip metrics for LinkedIn as it doesn't support it yet
        let metrics = null;
        if (shouldFetchMetrics && platformPostId && post.platform !== 'linkedin') {
          const platformSupport = engagementService.getPlatformSupport(post.platform);
          if (platformSupport.supportsMetrics) {
            try {
              // Add timeout to prevent hanging
              const metricsPromise = engagementService.getPlatformMetrics(
                user,
                post.platform,
                platformPostId
              );
              const timeoutPromise = new Promise((_, reject) => 
                setTimeout(() => reject(new Error('Metrics fetch timeout')), 5000)
              );
              
              const metricsResult = await Promise.race([metricsPromise, timeoutPromise]);
              if (metricsResult.success && metricsResult.metrics) {
                metrics = metricsResult.metrics;
              }
            } catch (error) {
              console.error(`Failed to fetch metrics for ${post.platform} post ${platformPostId}:`, error.message);
              // Don't fail the whole request if metrics fail - use stored analytics
              metrics = null;
            }
          }
        }

        return {
          _id: post._id,
          title: post.title,
          content: post.content,
          platform: post.platform,
          post_type: post.post_type,
          platform_post_id: platformPostId,
          platform_url: platformUrl,
          published_at: post.publishing?.published_at,
          metrics: metrics || post.analytics || {
            views: 0,
            likes: 0,
            comments: 0,
            shares: 0
          },
          createdAt: post.createdAt
        };
    });

    // Use Promise.allSettled to handle errors gracefully and prevent slow API calls from blocking
    const enrichedPostsResults = await Promise.allSettled(enrichedPostsPromises);
    const enrichedPosts = enrichedPostsResults.map((result, index) => {
      if (result.status === 'fulfilled') {
        return result.value;
      } else {
        // If enrichment failed, return basic post info
        console.error(`Failed to enrich post ${posts[index]._id}:`, result.reason);
        const post = posts[index];
        return {
          _id: post._id,
          title: post.title,
          content: post.content,
          platform: post.platform,
          post_type: post.post_type,
          platform_post_id: post.publishing?.platform_post_id || null,
          platform_url: post.publishing?.platform_url || null,
          published_at: post.publishing?.published_at,
          metrics: post.analytics || {
            views: 0,
            likes: 0,
            comments: 0,
            shares: 0
          },
          createdAt: post.createdAt
        };
      }
    });

    return res.status(HTTP_STATUS.OK).json({
      success: true,
      data: {
        posts: enrichedPosts,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          pages: Math.ceil(total / parseInt(limit))
        }
      }
    });
  });

  /**
   * Get platform support information
   * GET /api/engagement/platforms/support
   */
  getPlatformSupport = asyncHandler(async (req, res) => {
    const platforms = ['twitter', 'youtube', 'instagram', 'linkedin', 'facebook'];
    const support = {};

    platforms.forEach(platform => {
      support[platform] = engagementService.getPlatformSupport(platform);
    });

    return res.status(HTTP_STATUS.OK).json({
      success: true,
      data: support
    });
  });

  /**
   * Sync engagement metrics for a specific post
   * POST /api/engagement/posts/:postId/sync
   */
  syncPostMetrics = asyncHandler(async (req, res) => {
    const { postId } = req.params;
    const userId = req.userId;

    const post = await Post.findById(postId);
    if (!post) {
      return res.status(HTTP_STATUS.NOT_FOUND).json({
        success: false,
        message: 'Post not found'
      });
    }

    if (post.author.toString() !== userId.toString()) {
      return res.status(HTTP_STATUS.FORBIDDEN).json({
        success: false,
        message: 'You do not have permission to access this post'
      });
    }

    if (post.status !== 'published' || !post.publishing?.platform_post_id) {
      return res.status(HTTP_STATUS.BAD_REQUEST).json({
        success: false,
        message: 'Post is not published or does not have a platform post ID'
      });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(HTTP_STATUS.NOT_FOUND).json({
        success: false,
        message: 'User not found'
      });
    }

    const metricsResult = await engagementService.getPlatformMetrics(
      user,
      post.platform,
      post.publishing.platform_post_id
    );

    if (!metricsResult.success) {
      return res.status(HTTP_STATUS.OK).json({
        success: false,
        comingSoon: metricsResult.comingSoon || false,
        message: metricsResult.message || metricsResult.error,
        data: metricsResult
      });
    }

    // Update post analytics
    if (metricsResult.metrics) {
      post.analytics = {
        views: metricsResult.metrics.views || post.analytics?.views || 0,
        likes: metricsResult.metrics.likes || post.analytics?.likes || 0,
        comments: metricsResult.metrics.comments || post.analytics?.comments || 0,
        shares: metricsResult.metrics.shares || post.analytics?.shares || 0,
        clicks: post.analytics?.clicks || 0,
        lastUpdated: new Date()
      };
      await post.save();
    }

    return res.status(HTTP_STATUS.OK).json({
      success: true,
      message: 'Metrics synced successfully',
      data: {
        metrics: metricsResult.metrics,
        url: metricsResult.url || post.publishing.platform_url
      }
    });
  });
}

module.exports = new EngagementController();

