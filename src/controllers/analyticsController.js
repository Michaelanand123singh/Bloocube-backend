// src/controllers/analyticsController.js
const Analytics = require('../models/Analytics');
const { HTTP_STATUS } = require('../utils/constants');
const { asyncHandler } = require('../middlewares/errorHandler');

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
  res.json({ success: true, data: { analytics: records } });
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
  getPostsTimeSeries,
  getSuccessFailure
};


