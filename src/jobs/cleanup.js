// src/jobs/cleanup.js
const AIResults = require('../models/AI_Results');
const NotificationService = require('../services/notificationService');
const logger = require('../utils/logger');

async function cleanup() {
  try {
    // Cleanup expired AI results
    const aiRes = await AIResults.cleanupExpired();
    logger.info('AI results cleanup executed', { matched: aiRes.matchedCount, modified: aiRes.modifiedCount });

    // Cleanup expired notifications
    const notificationCount = await NotificationService.cleanupExpiredNotifications();
    logger.info('Notifications cleanup executed', { deleted: notificationCount });

    logger.info('Cleanup job completed successfully');
  } catch (e) {
    logger.error('Cleanup job failed', e);
  }
}

module.exports = cleanup;


