// src/controllers/campaignController.js
const Campaign = require('../models/Campaign');
const Bid = require('../models/Bid');
const User = require('../models/User');
const logger = require('../utils/logger');
const { HTTP_STATUS, SUCCESS_MESSAGES, ERROR_MESSAGES, PAGINATION } = require('../utils/constants');
const { asyncHandler } = require('../middlewares/errorHandler');

/**
 * Create a new campaign
 */
const createCampaign = asyncHandler(async (req, res) => {
  const campaignData = {
    ...req.body,
    brand_id: req.userId
  };

  const campaign = new Campaign(campaignData);
  await campaign.save();

  logger.info('Campaign created', { campaignId: campaign._id, brandId: req.userId });

  res.status(HTTP_STATUS.CREATED).json({
    success: true,
    message: SUCCESS_MESSAGES.CAMPAIGN_CREATED,
    data: { campaign }
  });
});

/**
 * Get all campaigns with filtering and pagination
 */
const getCampaigns = asyncHandler(async (req, res) => {
  const {
    page = PAGINATION.DEFAULT_PAGE,
    limit = PAGINATION.DEFAULT_LIMIT,
    status,
    platform,
    minBudget,
    maxBudget,
    sort = '-createdAt'
  } = req.query;

  // Build filter object
  const filter = {};
  
  if (status) filter.status = status;
  if (platform) filter['requirements.platforms'] = platform;
  if (minBudget || maxBudget) {
    filter.budget = {};
    if (minBudget) filter.budget.$gte = parseInt(minBudget);
    if (maxBudget) filter.budget.$lte = parseInt(maxBudget);
  }

  // Only show public campaigns for non-admin users
  if (req.user.role !== 'admin') {
    filter.isPublic = true;
  }

  const skip = (parseInt(page) - 1) * parseInt(limit);

  const campaigns = await Campaign.find(filter)
    .populate('brand_id', 'name email profile')
    .sort(sort)
    .skip(skip)
    .limit(parseInt(limit));

  const total = await Campaign.countDocuments(filter);

  logger.info('Campaigns retrieved', { count: campaigns.length, total });

  res.json({
    success: true,
    data: {
      campaigns,
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
 * Get campaign by ID
 */
const getCampaign = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const campaign = await Campaign.findById(id)
    .populate('brand_id', 'name email profile')
    .populate('selectedCreators.creator_id', 'name profile');

  if (!campaign) {
    return res.status(HTTP_STATUS.NOT_FOUND).json({
      success: false,
      message: 'Campaign not found'
    });
  }

  // Check if user can view this campaign
  if (!campaign.isPublic && 
      campaign.brand_id._id.toString() !== req.userId.toString() && 
      req.user.role !== 'admin') {
    return res.status(HTTP_STATUS.FORBIDDEN).json({
      success: false,
      message: ERROR_MESSAGES.ACCESS_DENIED
    });
  }

  logger.info('Campaign retrieved', { campaignId: id });

  res.json({
    success: true,
    data: { campaign }
  });
});

/**
 * Update campaign
 */
const updateCampaign = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const updateData = req.body;

  const campaign = await Campaign.findById(id);
  if (!campaign) {
    return res.status(HTTP_STATUS.NOT_FOUND).json({
      success: false,
      message: 'Campaign not found'
    });
  }

  // Check ownership
  if (campaign.brand_id.toString() !== req.userId.toString() && req.user.role !== 'admin') {
    return res.status(HTTP_STATUS.FORBIDDEN).json({
      success: false,
      message: ERROR_MESSAGES.ACCESS_DENIED
    });
  }

  // Update campaign
  Object.assign(campaign, updateData);
  await campaign.save();

  logger.info('Campaign updated', { campaignId: id });

  res.json({
    success: true,
    message: SUCCESS_MESSAGES.CAMPAIGN_UPDATED,
    data: { campaign }
  });
});

/**
 * Delete campaign
 */
const deleteCampaign = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const campaign = await Campaign.findById(id);
  if (!campaign) {
    return res.status(HTTP_STATUS.NOT_FOUND).json({
      success: false,
      message: 'Campaign not found'
    });
  }

  // Check ownership
  if (campaign.brand_id.toString() !== req.userId.toString() && req.user.role !== 'admin') {
    return res.status(HTTP_STATUS.FORBIDDEN).json({
      success: false,
      message: ERROR_MESSAGES.ACCESS_DENIED
    });
  }

  // Delete related bids
  await Bid.deleteMany({ campaign_id: id });

  await Campaign.findByIdAndDelete(id);

  logger.info('Campaign deleted', { campaignId: id });

  res.json({
    success: true,
    message: SUCCESS_MESSAGES.CAMPAIGN_DELETED
  });
});

/**
 * Get campaigns by brand
 */
const getBrandCampaigns = asyncHandler(async (req, res) => {
  const { brandId } = req.params;
  const {
    page = PAGINATION.DEFAULT_PAGE,
    limit = PAGINATION.DEFAULT_LIMIT,
    status,
    sort = '-createdAt'
  } = req.query;

  // Check if user can view brand campaigns
  if (brandId !== req.userId.toString() && req.user.role !== 'admin') {
    return res.status(HTTP_STATUS.FORBIDDEN).json({
      success: false,
      message: ERROR_MESSAGES.ACCESS_DENIED
    });
  }

  const filter = { brand_id: brandId };
  if (status) filter.status = status;

  const skip = (parseInt(page) - 1) * parseInt(limit);

  const campaigns = await Campaign.find(filter)
    .populate('brand_id', 'name email profile')
    .sort(sort)
    .skip(skip)
    .limit(parseInt(limit));

  const total = await Campaign.countDocuments(filter);

  res.json({
    success: true,
    data: {
      campaigns,
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
 * Get campaign bids
 */
const getCampaignBids = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const {
    page = PAGINATION.DEFAULT_PAGE,
    limit = PAGINATION.DEFAULT_LIMIT,
    status,
    sort = '-createdAt'
  } = req.query;

  const campaign = await Campaign.findById(id);
  if (!campaign) {
    return res.status(HTTP_STATUS.NOT_FOUND).json({
      success: false,
      message: 'Campaign not found'
    });
  }

  // Check if user can view bids
  if (campaign.brand_id.toString() !== req.userId.toString() && req.user.role !== 'admin') {
    return res.status(HTTP_STATUS.FORBIDDEN).json({
      success: false,
      message: ERROR_MESSAGES.ACCESS_DENIED
    });
  }

  const filter = { campaign_id: id };
  if (status) filter.status = status;

  const skip = (parseInt(page) - 1) * parseInt(limit);

  const bids = await Bid.find(filter)
    .populate('creator_id', 'name email profile socialAccounts')
    .populate('campaign_id', 'title requirements')
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
 * Accept bid
 */
const acceptBid = asyncHandler(async (req, res) => {
  const { campaignId, bidId } = req.params;

  const campaign = await Campaign.findById(campaignId);
  if (!campaign) {
    return res.status(HTTP_STATUS.NOT_FOUND).json({
      success: false,
      message: 'Campaign not found'
    });
  }

  // Check ownership
  if (campaign.brand_id.toString() !== req.userId.toString() && req.user.role !== 'admin') {
    return res.status(HTTP_STATUS.FORBIDDEN).json({
      success: false,
      message: ERROR_MESSAGES.ACCESS_DENIED
    });
  }

  const bid = await Bid.findById(bidId);
  if (!bid) {
    return res.status(HTTP_STATUS.NOT_FOUND).json({
      success: false,
      message: 'Bid not found'
    });
  }

  // Accept bid
  await bid.accept();

  // Add creator to selected creators
  campaign.selectedCreators.push({
    creator_id: bid.creator_id,
    status: 'selected'
  });

  await campaign.save();

  logger.info('Bid accepted', { bidId, campaignId });

  res.json({
    success: true,
    message: SUCCESS_MESSAGES.BID_ACCEPTED,
    data: { bid }
  });
});

/**
 * Reject bid
 */
const rejectBid = asyncHandler(async (req, res) => {
  const { campaignId, bidId } = req.params;

  const campaign = await Campaign.findById(campaignId);
  if (!campaign) {
    return res.status(HTTP_STATUS.NOT_FOUND).json({
      success: false,
      message: 'Campaign not found'
    });
  }

  // Check ownership
  if (campaign.brand_id.toString() !== req.userId.toString() && req.user.role !== 'admin') {
    return res.status(HTTP_STATUS.FORBIDDEN).json({
      success: false,
      message: ERROR_MESSAGES.ACCESS_DENIED
    });
  }

  const bid = await Bid.findById(bidId);
  if (!bid) {
    return res.status(HTTP_STATUS.NOT_FOUND).json({
      success: false,
      message: 'Bid not found'
    });
  }

  // Reject bid
  await bid.reject();

  logger.info('Bid rejected', { bidId, campaignId });

  res.json({
    success: true,
    message: SUCCESS_MESSAGES.BID_REJECTED,
    data: { bid }
  });
});

/**
 * Get campaign analytics
 */
const getCampaignAnalytics = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const campaign = await Campaign.findById(id);
  if (!campaign) {
    return res.status(HTTP_STATUS.NOT_FOUND).json({
      success: false,
      message: 'Campaign not found'
    });
  }

  // Check ownership
  if (campaign.brand_id.toString() !== req.userId.toString() && req.user.role !== 'admin') {
    return res.status(HTTP_STATUS.FORBIDDEN).json({
      success: false,
      message: ERROR_MESSAGES.ACCESS_DENIED
    });
  }

  // Get analytics data
  const Analytics = require('../models/Analytics');
  const analytics = await Analytics.findByCampaign(id);

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
      campaign,
      analytics: stats,
      posts: analytics
    }
  });
});

module.exports = {
  createCampaign,
  getCampaigns,
  getCampaign,
  updateCampaign,
  deleteCampaign,
  getBrandCampaigns,
  getCampaignBids,
  acceptBid,
  rejectBid,
  getCampaignAnalytics
};
