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
    // OPTIMIZATION: Batch fetch metrics by platform to avoid N+1 query problem
    const enrichedPosts = posts.map((post) => {
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

        // Return post with stored analytics for now
        // Metrics will be fetched in batch below if requested
        return {
          _id: post._id,
          title: post.title,
          content: post.content,
          platform: post.platform,
          post_type: post.post_type,
          platform_post_id: platformPostId,
          platform_url: platformUrl,
          published_at: post.publishing?.published_at,
          metrics: post.analytics || {
            views: 0,
            likes: 0,
            comments: 0,
            shares: 0
          },
          createdAt: post.createdAt
        };
    });

    // Batch fetch metrics by platform if requested (OPTIMIZATION: prevents N+1 queries)
    if (shouldFetchMetrics) {
      // Group posts by platform
      const postsByPlatform = {};
      enrichedPosts.forEach((post, index) => {
        if (post.platform_post_id && post.platform !== 'linkedin') {
          const platform = post.platform;
          if (!postsByPlatform[platform]) {
            postsByPlatform[platform] = [];
          }
          postsByPlatform[platform].push({ post, index });
        }
      });

      // Fetch metrics for each platform in parallel (one API call per platform instead of per post)
      const metricsPromises = Object.entries(postsByPlatform).map(async ([platform, postList]) => {
        try {
          const platformSupport = engagementService.getPlatformSupport(platform);
          if (!platformSupport.supportsMetrics) {
            return { platform, metrics: null };
          }

          // Fetch platform metrics (this gets all posts for the platform at once)
          const platformMetricsResult = await Promise.race([
            engagementService.getPlatformMetrics(user, platform, null),
            new Promise((_, reject) => 
              setTimeout(() => reject(new Error('Platform metrics fetch timeout')), 10000)
            )
          ]);

          if (platformMetricsResult.success && platformMetricsResult.posts) {
            // Create a map of postId -> metrics for quick lookup
            const metricsMap = {};
            platformMetricsResult.posts.forEach(p => {
              metricsMap[p.postId] = {
                views: p.views || 0,
                likes: p.likes || 0,
                comments: p.comments || 0,
                shares: p.shares || 0
              };
            });

            return { platform, metrics: metricsMap };
          }
        } catch (error) {
          console.error(`Failed to batch fetch metrics for ${platform}:`, error.message);
        }
        return { platform, metrics: null };
      });

      // Wait for all platform metrics to be fetched
      const metricsResults = await Promise.allSettled(metricsPromises);
      
      // Update enriched posts with fetched metrics
      metricsResults.forEach((result) => {
        if (result.status === 'fulfilled' && result.value.metrics) {
          const { platform, metrics } = result.value;
          const postList = postsByPlatform[platform];
          if (postList) {
            postList.forEach(({ post, index }) => {
              if (metrics[post.platform_post_id]) {
                enrichedPosts[index].metrics = metrics[post.platform_post_id];
              }
            });
          }
        }
      });
    }

    // enrichedPosts is already populated above with batch-fetched metrics

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

