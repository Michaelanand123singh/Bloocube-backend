// src/controllers/bidController.js
const Bid = require('../models/Bid');
const Campaign = require('../models/Campaign');
const User = require('../models/User');
const logger = require('../utils/logger');
const { HTTP_STATUS, SUCCESS_MESSAGES, ERROR_MESSAGES, PAGINATION } = require('../utils/constants');
const { asyncHandler } = require('../middlewares/errorHandler');

/**
 * Create a new bid
 */
const createBid = asyncHandler(async (req, res) => {
  const { campaign_id, ...bidData } = req.body;
  const creatorId = req.userId;

  // Check if campaign exists and is active
  const campaign = await Campaign.findById(campaign_id);
  if (!campaign) {
    return res.status(HTTP_STATUS.NOT_FOUND).json({
      success: false,
      message: 'Campaign not found'
    });
  }

  if (campaign.status !== 'active') {
    return res.status(HTTP_STATUS.BAD_REQUEST).json({
      success: false,
      message: 'Campaign is not active'
    });
  }

  if (!campaign.canApply) {
    return res.status(HTTP_STATUS.BAD_REQUEST).json({
      success: false,
      message: 'Campaign is no longer accepting applications'
    });
  }

  // Check if user already bid on this campaign
  const existingBid = await Bid.findOne({ campaign_id, creator_id: creatorId });
  if (existingBid) {
    return res.status(HTTP_STATUS.CONFLICT).json({
      success: false,
      message: 'You have already submitted a bid for this campaign'
    });
  }

  // Create bid
  const bid = new Bid({
    ...bidData,
    campaign_id,
    creator_id: creatorId
  });

  await bid.save();

  // Update campaign analytics
  campaign.analytics.totalApplications += 1;
  await campaign.save();

  // Create notification for admin users
  try {
    const NotificationService = require('../services/notificationService');
    await NotificationService.notifyBidReceived(bid, campaign);
  } catch (e) {
    logger.error('Failed to create bid notification', e);
  }

  logger.info('Bid created', { bidId: bid._id, campaignId: campaign_id, creatorId });

  res.status(HTTP_STATUS.CREATED).json({
    success: true,
    message: SUCCESS_MESSAGES.BID_CREATED,
    data: { bid }
  });
});

/**
 * Get all bids with filtering and pagination
 */
const getBids = asyncHandler(async (req, res) => {
  const {
    page = PAGINATION.DEFAULT_PAGE,
    limit = PAGINATION.DEFAULT_LIMIT,
    status,
    campaign_id,
    sort = '-createdAt'
  } = req.query;

  // Build filter object
  const filter = {};
  
  if (status) filter.status = status;
  if (campaign_id) filter.campaign_id = campaign_id;

  // For creators, only show their own bids
  if (req.user.role === 'creator') {
    filter.creator_id = req.userId;
  }

  const skip = (parseInt(page) - 1) * parseInt(limit);

  const bids = await Bid.find(filter)
    .populate('campaign_id', 'title description budget deadline status')
    .populate('creator_id', 'name email profile')
    .sort(sort)
    .skip(skip)
    .limit(parseInt(limit));

  const total = await Bid.countDocuments(filter);

  logger.info('Bids retrieved', { count: bids.length, total, userId: req.userId });

  res.json({
    success: true,
    data: {
      bids,
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
 * Get bid by ID
 */
const getBid = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const bid = await Bid.findById(id)
    .populate('campaign_id', 'title description budget deadline status brand_id')
    .populate('creator_id', 'name email profile');

  if (!bid) {
    return res.status(HTTP_STATUS.NOT_FOUND).json({
      success: false,
      message: 'Bid not found'
    });
  }

  // Check if user can view this bid
  const canView = req.user.role === 'admin' || 
                  bid.creator_id._id.toString() === req.userId.toString() ||
                  bid.campaign_id.brand_id.toString() === req.userId.toString();

  if (!canView) {
    return res.status(HTTP_STATUS.FORBIDDEN).json({
      success: false,
      message: ERROR_MESSAGES.ACCESS_DENIED
    });
  }

  logger.info('Bid retrieved', { bidId: id });

  res.json({
    success: true,
    data: { bid }
  });
});

/**
 * Update bid
 */
const updateBid = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const updateData = req.body;

  const bid = await Bid.findById(id);
  if (!bid) {
    return res.status(HTTP_STATUS.NOT_FOUND).json({
      success: false,
      message: 'Bid not found'
    });
  }

  // Check ownership
  if (bid.creator_id.toString() !== req.userId.toString() && req.user.role !== 'admin') {
    return res.status(HTTP_STATUS.FORBIDDEN).json({
      success: false,
      message: ERROR_MESSAGES.ACCESS_DENIED
    });
  }

  // Check if bid can be updated
  if (bid.status !== 'pending') {
    return res.status(HTTP_STATUS.BAD_REQUEST).json({
      success: false,
      message: 'Bid cannot be updated after it has been processed'
    });
  }

  // Update bid
  Object.assign(bid, updateData);
  await bid.save();

  logger.info('Bid updated', { bidId: id });

  res.json({
    success: true,
    message: SUCCESS_MESSAGES.BID_UPDATED,
    data: { bid }
  });
});

/**
 * Withdraw bid
 */
const withdrawBid = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const bid = await Bid.findById(id);
  if (!bid) {
    return res.status(HTTP_STATUS.NOT_FOUND).json({
      success: false,
      message: 'Bid not found'
    });
  }

  // Check ownership
  if (bid.creator_id.toString() !== req.userId.toString() && req.user.role !== 'admin') {
    return res.status(HTTP_STATUS.FORBIDDEN).json({
      success: false,
      message: ERROR_MESSAGES.ACCESS_DENIED
    });
  }

  // Check if bid can be withdrawn
  if (bid.status !== 'pending') {
    return res.status(HTTP_STATUS.BAD_REQUEST).json({
      success: false,
      message: 'Bid cannot be withdrawn after it has been processed'
    });
  }

  // Withdraw bid
  await bid.withdraw();

  logger.info('Bid withdrawn', { bidId: id });

  res.json({
    success: true,
    message: 'Bid withdrawn successfully',
    data: { bid }
  });
});

/**
 * Get bids by creator
 */
const getCreatorBids = asyncHandler(async (req, res) => {
  const { creatorId } = req.params;
  const {
    page = PAGINATION.DEFAULT_PAGE,
    limit = PAGINATION.DEFAULT_LIMIT,
    status,
    sort = '-createdAt'
  } = req.query;

  // Check if user can view creator bids
  if (creatorId !== req.userId.toString() && req.user.role !== 'admin') {
    return res.status(HTTP_STATUS.FORBIDDEN).json({
      success: false,
      message: ERROR_MESSAGES.ACCESS_DENIED
    });
  }

  const filter = { creator_id: creatorId };
  if (status) filter.status = status;

  const skip = (parseInt(page) - 1) * parseInt(limit);

  const bids = await Bid.find(filter)
    .populate('campaign_id', 'title description budget deadline status')
    .sort(sort)
    .skip(skip)
    .limit(parseInt(limit));

  const total = await Bid.countDocuments(filter);

  res.json({
    success: true,
    data: {
      bids,
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
 * Get bid analytics
 */
const getBidAnalytics = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const bid = await Bid.findById(id)
    .populate('campaign_id')
    .populate('creator_id');

  if (!bid) {
    return res.status(HTTP_STATUS.NOT_FOUND).json({
      success: false,
      message: 'Bid not found'
    });
  }

  // Check if user can view bid analytics
  const canView = req.user.role === 'admin' || 
                  bid.creator_id._id.toString() === req.userId.toString() ||
                  bid.campaign_id.brand_id.toString() === req.userId.toString();

  if (!canView) {
    return res.status(HTTP_STATUS.FORBIDDEN).json({
      success: false,
      message: ERROR_MESSAGES.ACCESS_DENIED
    });
  }

  // Get creator analytics for this campaign
  const Analytics = require('../models/Analytics');
  const analytics = await Analytics.find({
    user_id: bid.creator_id._id,
    campaign_id: bid.campaign_id._id
  });

  const stats = {
    totalPosts: analytics.length,
    totalViews: analytics.reduce((sum, a) => sum + (a.metrics.views || 0), 0),
    totalLikes: analytics.reduce((sum, a) => sum + (a.metrics.likes || 0), 0),
    totalComments: analytics.reduce((sum, a) => sum + (a.metrics.comments || 0), 0),
    totalShares: analytics.reduce((sum, a) => sum + (a.metrics.shares || 0), 0),
    avgEngagementRate: analytics.length > 0 
      ? analytics.reduce((sum, a) => sum + (a.metrics.engagement_rate || 0), 0) / analytics.length 
      : 0
  };

  res.json({
    success: true,
    data: {
      bid,
      analytics: stats,
      posts: analytics
    }
  });
});

/**
 * Add bid feedback
 */
const addBidFeedback = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { rating, comments, type = 'brand' } = req.body;

  const bid = await Bid.findById(id);
  if (!bid) {
    return res.status(HTTP_STATUS.NOT_FOUND).json({
      success: false,
      message: 'Bid not found'
    });
  }

  // Check if user can add feedback
  const campaign = await Campaign.findById(bid.campaign_id);
  const canAddFeedback = req.user.role === 'admin' || 
                        (type === 'brand' && campaign.brand_id.toString() === req.userId.toString()) ||
                        (type === 'creator' && bid.creator_id.toString() === req.userId.toString());

  if (!canAddFeedback) {
    return res.status(HTTP_STATUS.FORBIDDEN).json({
      success: false,
      message: ERROR_MESSAGES.ACCESS_DENIED
    });
  }

  // Add feedback
  if (type === 'brand') {
    bid.brand_feedback = { rating, comments, feedback_date: new Date() };
  } else {
    bid.creator_feedback = { rating, comments, feedback_date: new Date() };
  }

  await bid.save();

  logger.info('Bid feedback added', { bidId: id, type, rating });

  res.json({
    success: true,
    message: 'Feedback added successfully',
    data: { bid }
  });
});

module.exports = {
  createBid,
  getBids,
  getBid,
  updateBid,
  withdrawBid,
  getCreatorBids,
  getBidAnalytics,
  addBidFeedback
};
