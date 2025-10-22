// src/services/scheduler/jobScheduler.js
const cron = require('node-cron');
const { CRON_SCHEDULES } = require('../../utils/constants');
const Analytics = require('../../models/Analytics');
const AIResults = require('../../models/AI_Results');
const Post = require('../../models/Post');
const User = require('../../models/User');
const Announcement = require('../../models/Announcement');
const logger = require('../../utils/logger');
const postController = require('../../controllers/postController');
const emailQueue = require('../emailQueue');
const { retryPost, updatePostWithRetryInfo } = require('../../utils/retryLogic');

const jobs = [];

function scheduleJobs() {
  // Analytics sync placeholder
  jobs.push(cron.schedule(CRON_SCHEDULES.ANALYTICS_SYNC, async () => {
    logger.info('Running scheduled analytics sync');
    // TODO: Pull latest metrics from social APIs
  }));

  // Cleanup expired AI results
  jobs.push(cron.schedule(CRON_SCHEDULES.CLEANUP_EXPIRED_TOKENS, async () => {
    logger.info('Running cleanup for expired AI results');
    await AIResults.cleanupExpired();
  }));

  // Process scheduled posts every minute
  jobs.push(cron.schedule(CRON_SCHEDULES.SCHEDULED_POSTS_PROCESSOR, async () => {
    try {
      logger.info('⏱️ Checking for scheduled posts ready to publish');
      const readyPosts = await Post.findReadyForPublishing();
      if (!readyPosts || readyPosts.length === 0) {
        return;
      }

      for (const post of readyPosts) {
        try {
          const user = await User.findById(post.author);
          if (!user) {
            logger.warn('Author not found for post', { postId: post._id });
            continue;
          }

          // ✅ ADD: Use retry logic for scheduled posts
          const result = await retryPost(async () => {
            return await postController.executePlatformPost(post, user);
          }, post.platform, post);

          // ✅ ADD: Update post with retry information
          await updatePostWithRetryInfo(post, result);
          
          if (result.success) {
            logger.info('✅ Scheduled post published', { 
              postId: post._id, 
              platform: post.platform,
              retryCount: post.publishing.retry_count || 0
            });
          } else {
            logger.error('Failed to publish scheduled post after retries', { 
              postId: post._id, 
              error: result.error,
              retryCount: post.publishing.retry_count || 0
            });
          }
        } catch (e) {
          logger.error('Error processing scheduled post', { postId: post._id, error: e.message });
        }
      }
    } catch (err) {
      logger.error('Scheduled posts processor failed', { error: err.message });
    }
  }));

  // Process email queue every 2 minutes
  jobs.push(cron.schedule('*/2 * * * *', async () => {
    try {
      logger.info('📧 Processing email queue');
      await emailQueue.processQueue();
    } catch (err) {
      logger.error('Email queue processor failed', { error: err.message });
    }
  }));

  // Cleanup old announcements daily at 2 AM
  jobs.push(cron.schedule('0 2 * * *', async () => {
    try {
      logger.info('🧹 Running announcement cleanup');
      const result = await Announcement.cleanupOldAnnouncements();
      if (result.deletedCount > 0) {
        logger.info(`Cleaned up ${result.deletedCount} old announcements`);
      }
    } catch (err) {
      logger.error('Announcement cleanup failed', { error: err.message });
    }
  }));

  logger.info('Cron jobs scheduled');
}

function stopJobs() {
  jobs.forEach(job => job.stop());
  logger.info('Cron jobs stopped');
}

module.exports = { scheduleJobs, stopJobs };


