// src/controllers/adminController.js
const fs = require('fs');
const path = require('path');
const User = require('../models/User');
const Campaign = require('../models/Campaign');
const Bid = require('../models/Bid');
const Analytics = require('../models/Analytics');
const logger = require('../utils/logger');
const { HTTP_STATUS } = require('../utils/constants');
const { asyncHandler } = require('../middlewares/errorHandler');
const redisClient = require('../config/redis');

const dashboardStats = asyncHandler(async (req, res) => {
  const [users, campaigns, bids, analytics] = await Promise.all([
    User.countDocuments(),
    Campaign.countDocuments(),
    Bid.countDocuments(),
    Analytics.countDocuments()
  ]);

  res.json({
    success: true,
    data: { users, campaigns, bids, analytics }
  });
});

const listUsers = asyncHandler(async (req, res) => {
  const { role, active } = req.query;
  const filter = {};
  if (role) filter.role = role;
  if (active !== undefined) filter.isActive = active === 'true';

  const users = await User.find(filter).select('-password');
  res.json({ success: true, data: { users } });
});

const toggleUserActive = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const user = await User.findById(id);
  if (!user) return res.status(HTTP_STATUS.NOT_FOUND).json({ success: false, message: 'User not found' });
  user.isActive = !user.isActive;
  await user.save();
  res.json({ success: true, data: { user } });
});

const listCampaigns = asyncHandler(async (req, res) => {
  const campaigns = await Campaign.find({}).populate('brand_id', 'name email');
  res.json({ success: true, data: { campaigns } });
});

const getLogs = asyncHandler(async (req, res) => {
  // Read the last N entries from log files (combined + error)
  const limit = Math.max(0, Math.min(parseInt(req.query.limit || '200', 10), 1000));
  const logsDir = path.join(process.cwd(), 'logs');
  const files = [
    path.join(logsDir, 'error.log'),
    path.join(logsDir, 'combined.log')
  ];

  const entries = [];
  for (const file of files) {
    try {
      if (!fs.existsSync(file)) continue;
      const content = fs.readFileSync(file, 'utf-8');
      const lines = content.split(/\r?\n/).filter(Boolean);
      for (const line of lines.slice(-limit)) {
        try {
          const parsed = JSON.parse(line);
          entries.push({
            timestamp: parsed.timestamp || new Date().toISOString(),
            level: parsed.level || 'info',
            message: parsed.message || '',
            service: parsed.service,
            error: parsed.stack || parsed.error,
            metadata: parsed
          });
        } catch (_) {
          // Non-JSON line from pretty Print, fallback to text
          entries.push({
            timestamp: new Date().toISOString(),
            level: file.endsWith('error.log') ? 'error' : 'info',
            message: line
          });
        }
      }
    } catch (e) {
      logger.error('Failed to read logs', e);
    }
  }

  // Sort by timestamp descending
  entries.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
  res.json({ success: true, data: entries.slice(0, limit) });
});

// Settings storage in Redis under a single key
const SETTINGS_KEY = 'admin:settings:v1';

const getSettings = asyncHandler(async (req, res) => {
  try {
    const raw = await redisClient.get(SETTINGS_KEY);
    const settings = raw ? JSON.parse(raw) : {};
    res.json({ success: true, data: settings });
  } catch (e) {
    logger.error('Failed to get settings', e);
    res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({ success: false, message: 'Failed to get settings' });
  }
});

const updateSettings = asyncHandler(async (req, res) => {
  try {
    const payload = req.body || {};

    // Basic shape hardening
    const settings = {
      apiKeys: payload.apiKeys || {},
      email: payload.email || {},
      database: payload.database || {},
      security: payload.security || {}
    };

    await redisClient.set(SETTINGS_KEY, JSON.stringify(settings));
    res.json({ success: true, data: settings });
  } catch (e) {
    logger.error('Failed to update settings', e);
    res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({ success: false, message: 'Failed to update settings' });
  }
});

module.exports = {
  dashboardStats,
  listUsers,
  toggleUserActive,
  listCampaigns,
  getLogs,
  getSettings,
  updateSettings
};


