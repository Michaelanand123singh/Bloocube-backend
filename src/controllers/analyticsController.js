// src/controllers/analyticsController.js
const Analytics = require('../models/Analytics');
const { HTTP_STATUS } = require('../utils/constants');
const { asyncHandler } = require('../middlewares/errorHandler');
const Post = require('../models/Post');
const User = require('../models/User');

// Social services (used if available)
let TwitterService, LinkedInService, YouTubeService, FacebookService;
try { TwitterService = require('../services/social/twitter'); } catch {}
try { LinkedInService = require('../services/social/linkedin'); } catch {}
try { YouTubeService = require('../services/social/youtube'); } catch {}
try { FacebookService = require('../services/social/facebook'); } catch {}

// Create analytics record (admin/system)
const createAnalytics = asyncHandler(async (req, res) => {
  const analytics = new Analytics(req.body);
  await analytics.save();
  res.status(HTTP_STATUS.CREATED).json({ success: true, data: { analytics } });
});

// Get analytics by user
const getUserAnalytics = asyncHandler(async (req, res) => {
  const { userId } = req.params;
  const { platform } = req.query;
  const records = await Analytics.findByUser(userId, platform);

  if (records && records.length > 0) {
    return res.json({ success: true, data: { analytics: records } });
  }

  // Fallback: synthesize analytics from user's published posts
  const postQuery = { author: userId, status: 'published' };
  if (platform) {
    postQuery.platform = platform;
  }

  const posts = await Post.find(postQuery).sort({ 'publishing.published_at': -1 }).limit(200);

  const synthesized = posts.map((p) => ({
    user_id: p.author,
    platform: p.platform,
    post_id: p.publishing?.platform_post_id || p._id?.toString(),
    post_type: p.post_type,
    content: {
      caption: typeof p.content === 'object' ? (p.content.caption || p.title || '') : (p.title || ''),
      media_type: Array.isArray(p.media) && p.media.length > 0 ? p.media[0].type : undefined,
      media_count: Array.isArray(p.media) ? p.media.length : undefined
    },
    metrics: {
      views: p.analytics?.views || 0,
      likes: p.analytics?.likes || 0,
      comments: p.analytics?.comments || 0,
      shares: p.analytics?.shares || 0,
      clicks: p.analytics?.clicks || 0,
    },
    timing: {
      posted_at: p.publishing?.published_at || p.createdAt
    }
  }));

  return res.json({ success: true, data: { analytics: synthesized } });
});

// Sync analytics from linked social accounts into Analytics collection
const syncUserAnalytics = asyncHandler(async (req, res) => {
  const { userId } = req.params;
  const { days = 30, limit = 50 } = req.query;

  const user = await User.findById(userId);
  if (!user) {
    return res.status(HTTP_STATUS.NOT_FOUND).json({ success: false, message: 'User not found' });
  }

  const sinceDate = new Date();
  sinceDate.setDate(sinceDate.getDate() - Math.max(1, parseInt(days)));

  const upserts = [];

  // Helper to upsert analytics
  const upsertAnalytics = async (doc) => {
    try {
      // Compute engagement rate if possible
      const likes = doc.metrics?.likes || 0;
      const comments = doc.metrics?.comments || 0;
      const shares = doc.metrics?.shares || 0;
      const totalEngagement = likes + comments + shares;
      const denominator = Math.max(doc.metrics?.views || doc.metrics?.reach || doc.metrics?.impressions || doc.metrics?.followers || 1, 1);
      const engagementRate = parseFloat(((totalEngagement / denominator) * 100).toFixed(2));

      // Prefer schema auto-calc when followers present; otherwise set explicit rate
      doc.metrics = {
        followers: doc.metrics?.followers || 0,
        views: doc.metrics?.views || 0,
        likes,
        comments,
        shares,
        saves: doc.metrics?.saves || 0,
        reach: doc.metrics?.reach || 0,
        impressions: doc.metrics?.impressions || 0,
        clicks: doc.metrics?.clicks || 0,
        engagement_rate: engagementRate
      };

      await Analytics.updateOne(
        { user_id: doc.user_id, platform: doc.platform, post_id: doc.post_id },
        { $set: doc },
        { upsert: true }
      );
    } catch (e) {
      // Swallow per-item errors to continue sync
    }
  };

  // Twitter
  if (user.socialAccounts?.twitter?.username && TwitterService?.getUserTweets) {
    try {
      const tweets = await TwitterService.getUserTweets(user.socialAccounts.twitter.username, { max_results: Math.min(100, parseInt(limit) || 50) });
      for (const t of tweets || []) {
        const createdAt = new Date(t.created_at || t.createdAt || Date.now());
        if (createdAt < sinceDate) continue;
        await upsertAnalytics({
          user_id: user._id,
          platform: 'twitter',
          post_id: t.id?.toString(),
          post_type: t.referenced_tweets?.[0]?.type === 'replied_to' ? 'thread' : 'tweet',
          content: { caption: t.text || '', media_type: Array.isArray(t.attachments?.media_keys) ? 'image' : 'text' },
          metrics: {
            likes: t.public_metrics?.like_count || 0,
            comments: t.public_metrics?.reply_count || 0,
            shares: t.public_metrics?.retweet_count || 0,
            impressions: t.public_metrics?.impression_count || 0
          },
          timing: { posted_at: createdAt }
        });
      }
    } catch {}
  }

  // LinkedIn
  if (user.socialAccounts?.linkedin?.username && LinkedInService?.getUserPosts) {
    try {
      const posts = await LinkedInService.getUserPosts(user.socialAccounts.linkedin.username, { limit: Math.min(100, parseInt(limit) || 50) });
      for (const p of posts || []) {
        const createdAt = new Date(p.created_at || p.createdAt || Date.now());
        if (createdAt < sinceDate) continue;
        await upsertAnalytics({
          user_id: user._id,
          platform: 'linkedin',
          post_id: (p.id || p.urn || '').toString(),
          post_type: p.video ? 'video' : 'post',
          content: { caption: p.text || p.caption || '', media_type: p.video ? 'video' : 'text' },
          metrics: {
            likes: p.like_count || p.likes || 0,
            comments: p.comment_count || p.comments || 0,
            shares: p.share_count || p.shares || 0,
            impressions: p.impressions || 0
          },
          timing: { posted_at: createdAt }
        });
      }
    } catch {}
  }

  // YouTube
  if (user.socialAccounts?.youtube?.id && YouTubeService?.getChannelVideos) {
    try {
      const videos = await YouTubeService.getChannelVideos(user.socialAccounts.youtube.id, { maxResults: Math.min(50, parseInt(limit) || 25) });
      for (const v of videos || []) {
        const published = new Date(v.snippet?.publishedAt || Date.now());
        if (published < sinceDate) continue;
        await upsertAnalytics({
          user_id: user._id,
          platform: 'youtube',
          post_id: v.id?.videoId || v.id || '',
          post_type: 'video',
          content: { title: v.snippet?.title || '', caption: v.snippet?.description || '', media_type: 'video' },
          metrics: {
            views: Number(v.statistics?.viewCount || 0),
            likes: Number(v.statistics?.likeCount || 0),
            comments: Number(v.statistics?.commentCount || 0),
            shares: 0
          },
          timing: { posted_at: published }
        });
      }
    } catch {}
  }

  // Facebook (page-level)
  if (user.socialAccounts?.facebook?.username && FacebookService?.getPagePosts) {
    try {
      const posts = await FacebookService.getPagePosts(user.socialAccounts.facebook.username, { limit: Math.min(50, parseInt(limit) || 25) });
      const postsArray = Array.isArray(posts) ? posts : posts?.posts || [];
      for (const p of postsArray) {
        const created = new Date(p.created_time || p.created_at || Date.now());
        if (created < sinceDate) continue;
        await upsertAnalytics({
          user_id: user._id,
          platform: 'facebook',
          post_id: p.id?.toString(),
          post_type: p.type || 'post',
          content: { caption: p.message || p.text || '', media_type: (p.type === 'photo' ? 'image' : 'text') },
          metrics: {
            likes: p.like_count || p.reactions?.summary?.total_count || 0,
            comments: p.comment_count || p.comments?.summary?.total_count || 0,
            shares: p.share_count || p.shares?.count || 0
          },
          timing: { posted_at: created }
        });
      }
    } catch {}
  }

  // Instagram: not implemented service here; skipping for now

  return res.json({ success: true, data: { synced: true } });
});

// Get posts from linked accounts (for Recent Posts display)
const getLinkedAccountPosts = asyncHandler(async (req, res) => {
  const userId = req.userId || req.params.userId;
  const { limit = 10, platform } = req.query;

  if (!userId) {
    return res.status(HTTP_STATUS.BAD_REQUEST).json({
      success: false,
      message: 'User ID is required'
    });
  }

  const user = await User.findById(userId);
  if (!user) {
    return res.status(HTTP_STATUS.NOT_FOUND).json({
      success: false,
      message: 'User not found'
    });
  }

  const posts = [];
  const sinceDate = new Date();
  sinceDate.setDate(sinceDate.getDate() - 30); // Last 30 days

  // Twitter
  if ((!platform || platform === 'twitter') && user.socialAccounts?.twitter?.username && TwitterService?.getUserTweets) {
    try {
      const tweets = await TwitterService.getUserTweets(
        user.socialAccounts.twitter.username, 
        { max_results: Math.min(parseInt(limit) || 10, 50) }
      );
      for (const t of tweets || []) {
        const createdAt = new Date(t.created_at || t.createdAt || Date.now());
        if (createdAt < sinceDate) continue;
        posts.push({
          _id: t.id?.toString() || `twitter_${Date.now()}_${Math.random()}`,
          platform: 'twitter',
          title: null,
          content: t.text || '',
          status: 'published',
          analytics: {
            likes: t.public_metrics?.like_count || 0,
            comments: t.public_metrics?.reply_count || 0,
            shares: t.public_metrics?.retweet_count || 0,
            views: t.public_metrics?.impression_count || 0
          },
          publishing: {
            published_at: createdAt.toISOString(),
            platform_post_id: t.id?.toString(),
            platform_url: `https://twitter.com/${user.socialAccounts.twitter.username}/status/${t.id}`
          },
          createdAt: createdAt.toISOString()
        });
      }
    } catch (err) {
      console.error('Error fetching Twitter posts:', err.message);
    }
  }

  // LinkedIn
  if ((!platform || platform === 'linkedin') && user.socialAccounts?.linkedin?.username && LinkedInService?.getUserPosts) {
    try {
      const linkedinPosts = await LinkedInService.getUserPosts(
        user.socialAccounts.linkedin.username, 
        { limit: Math.min(parseInt(limit) || 10, 50) }
      );
      for (const p of linkedinPosts || []) {
        const createdAt = new Date(p.created_at || p.createdAt || Date.now());
        if (createdAt < sinceDate) continue;
        posts.push({
          _id: (p.id || p.urn || '').toString() || `linkedin_${Date.now()}_${Math.random()}`,
          platform: 'linkedin',
          title: null,
          content: p.text || p.caption || '',
          status: 'published',
          analytics: {
            likes: p.like_count || p.likes || 0,
            comments: p.comment_count || p.comments || 0,
            shares: p.share_count || p.shares || 0,
            views: p.impressions || 0
          },
          publishing: {
            published_at: createdAt.toISOString(),
            platform_post_id: (p.id || p.urn || '').toString(),
            platform_url: p.url || null
          },
          createdAt: createdAt.toISOString()
        });
      }
    } catch (err) {
      console.error('Error fetching LinkedIn posts:', err.message);
    }
  }

  // YouTube
  if ((!platform || platform === 'youtube') && user.socialAccounts?.youtube?.id && YouTubeService?.getChannelVideos) {
    try {
      const videos = await YouTubeService.getChannelVideos(
        user.socialAccounts.youtube.id, 
        { maxResults: Math.min(parseInt(limit) || 10, 50) }
      );
      for (const v of videos || []) {
        const published = new Date(v.snippet?.publishedAt || Date.now());
        if (published < sinceDate) continue;
        const videoId = v.id?.videoId || v.id;
        posts.push({
          _id: videoId || `youtube_${Date.now()}_${Math.random()}`,
          platform: 'youtube',
          title: v.snippet?.title || '',
          content: v.snippet?.description || '',
          status: 'published',
          analytics: {
            views: Number(v.statistics?.viewCount || 0),
            likes: Number(v.statistics?.likeCount || 0),
            comments: Number(v.statistics?.commentCount || 0),
            shares: 0
          },
          publishing: {
            published_at: published.toISOString(),
            platform_post_id: videoId,
            platform_url: `https://www.youtube.com/watch?v=${videoId}`
          },
          createdAt: published.toISOString()
        });
      }
    } catch (err) {
      console.error('Error fetching YouTube videos:', err.message);
    }
  }

  // Facebook
  if ((!platform || platform === 'facebook') && user.socialAccounts?.facebook?.username && FacebookService?.getPagePosts) {
    try {
      const fbPosts = await FacebookService.getPagePosts(
        user.socialAccounts.facebook.username, 
        { limit: Math.min(parseInt(limit) || 10, 50) }
      );
      const postsArray = Array.isArray(fbPosts) ? fbPosts : fbPosts?.posts || [];
      for (const p of postsArray) {
        const created = new Date(p.created_time || p.created_at || Date.now());
        if (created < sinceDate) continue;
        posts.push({
          _id: p.id?.toString() || `facebook_${Date.now()}_${Math.random()}`,
          platform: 'facebook',
          title: null,
          content: p.message || p.text || '',
          status: 'published',
          analytics: {
            likes: p.like_count || p.reactions?.summary?.total_count || 0,
            comments: p.comment_count || p.comments?.summary?.total_count || 0,
            shares: p.share_count || p.shares?.count || 0,
            views: 0
          },
          publishing: {
            published_at: created.toISOString(),
            platform_post_id: p.id?.toString(),
            platform_url: p.permalink_url || null
          },
          createdAt: created.toISOString()
        });
      }
    } catch (err) {
      console.error('Error fetching Facebook posts:', err.message);
    }
  }

  // Instagram: Not yet implemented - requires Graph API with Business account
  // if ((!platform || platform === 'instagram') && user.socialAccounts?.instagram?.igAccountId) {
  //   // TODO: Implement Instagram posts fetching
  // }

  // Sort by published date (most recent first)
  posts.sort((a, b) => {
    const dateA = new Date(a.publishing?.published_at || a.createdAt);
    const dateB = new Date(b.publishing?.published_at || b.createdAt);
    return dateB.getTime() - dateA.getTime();
  });

  // Limit results
  const limitedPosts = posts.slice(0, parseInt(limit) || 10);

  res.json({
    success: true,
    posts: limitedPosts,
    total: posts.length
  });
});

// Get top performing posts
const getTopPerforming = asyncHandler(async (req, res) => {
  const { limit = 10 } = req.query;
  const top = await Analytics.findTopPerforming(parseInt(limit));
  res.json({ success: true, data: { posts: top } });
});

// Get platform stats
const getPlatformStats = asyncHandler(async (req, res) => {
  const { platform } = req.params;
  const stats = await Analytics.getPlatformStats(platform);
  res.json({ success: true, data: { stats: stats?.[0] || {} } });
});

// Get posts time series (admin)
const getPostsTimeSeries = asyncHandler(async (req, res) => {
  const { period = 'last_30_days' } = req.query;
  const now = new Date();
  const days = period === 'last_7_days' ? 7 : period === 'last_90_days' ? 90 : 30;
  const start = new Date(now);
  start.setDate(now.getDate() - days);

  const series = await Analytics.aggregate([
    { $match: { captured_at: { $gte: start } } },
    {
      $group: {
        _id: {
          y: { $year: '$captured_at' },
          m: { $month: '$captured_at' },
          d: { $dayOfMonth: '$captured_at' }
        },
        count: { $sum: 1 }
      }
    },
    { $sort: { '_id.y': 1, '_id.m': 1, '_id.d': 1 } }
  ]);

  const labels = [];
  const values = [];
  for (const item of series) {
    const label = `${item._id.m}/${item._id.d}`;
    labels.push(label);
    values.push(item.count);
  }

  res.json({ success: true, data: { series: labels.map((label, i) => ({ label, value: values[i] })) } });
});

// Get success vs failure aggregated (admin)
const getSuccessFailure = asyncHandler(async (req, res) => {
  const { period = 'last_30_days' } = req.query;
  const now = new Date();
  const days = period === 'last_7_days' ? 7 : period === 'last_90_days' ? 90 : 30;
  const start = new Date(now);
  start.setDate(now.getDate() - days);

  // Define success by engagement_rate >= 5
  const data = await Analytics.aggregate([
    { $match: { captured_at: { $gte: start } } },
    {
      $project: {
        captured_at: 1,
        isSuccess: { $gte: ['$metrics.engagement_rate', 5] }
      }
    },
    {
      $group: {
        _id: {
          y: { $year: '$captured_at' },
          m: { $month: '$captured_at' }
        },
        success: { $sum: { $cond: ['$isSuccess', 1, 0] } },
        failed: { $sum: { $cond: ['$isSuccess', 0, 1] } }
      }
    },
    { $sort: { '_id.y': 1, '_id.m': 1 } }
  ]);

  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const bars = data.map(item => ({
    label: months[(item._id.m - 1) % 12],
    success: item.success,
    failed: item.failed
  }));

  res.json({ success: true, data: { bars } });
});

module.exports = {
  createAnalytics,
  getUserAnalytics,
  getTopPerforming,
  getPlatformStats,
  syncUserAnalytics,
  getPostsTimeSeries,
  getSuccessFailure,
  getLinkedAccountPosts
};


