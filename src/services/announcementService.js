// src/services/announcementService.js
const User = require('../models/User');
const Notification = require('../models/Notification');
const Announcement = require('../models/Announcement');
const emailQueue = require('./emailQueue');
const logger = require('../utils/logger');
const { NOTIFICATION_TYPES } = require('../utils/constants');

class AnnouncementService {
  /**
   * Create and send announcement to users
   */
  static async createAnnouncement({
    title,
    message,
    targetRoles = ['creator', 'brand'],
    priority = 'high',
    data = {},
    actions = [],
    expiresAt = null,
    sendEmail = true,
    createdBy = null,
    autoCleanup = { enabled: true, cleanupAfter: 30 }
  }) {
    try {
      logger.info('Creating announcement', { 
        title, 
        targetRoles, 
        priority,
        sendEmail 
      });

      // Get target users
      const targetUsers = await this.getTargetUsers(targetRoles);
      
      if (targetUsers.length === 0) {
        throw new Error('No users found for the specified roles');
      }

      // Create announcement record
      const announcement = new Announcement({
        title,
        message,
        targetRoles,
        priority,
        status: 'sent',
        emailSettings: {
          sendEmail,
          emailSent: 0,
          emailFailed: 0,
          emailPending: sendEmail ? targetUsers.length : 0
        },
        notificationSettings: {
          notificationsCreated: 0,
          notificationsRead: 0
        },
        actions,
        data,
        expiresAt: expiresAt ? new Date(expiresAt) : null,
        createdBy,
        autoCleanup,
        stats: {
          totalRecipients: targetUsers.length
        }
      });

      await announcement.save();

      // Create notifications for all target users
      const notifications = await this.createNotifications({
        title,
        message,
        targetUsers,
        priority,
        data,
        actions,
        expiresAt,
        announcementId: announcement._id
      });

      // Update announcement with notification count
      announcement.notificationSettings.notificationsCreated = notifications.length;
      await announcement.save();

      // Send emails if requested
      let emailJobs = 0;
      if (sendEmail) {
        try {
          emailJobs = await this.queueAnnouncementEmails({
            title,
            message,
            targetUsers,
            priority,
            data,
            announcementId: announcement._id
          });
        } catch (emailError) {
          logger.error('Failed to queue announcement emails', emailError);
          // Continue with announcement creation even if email fails
          emailJobs = 0;
        }
      }

      logger.info('Announcement created successfully', {
        announcementId: announcement._id,
        notificationsCreated: notifications.length,
        emailsQueued: emailJobs,
        targetRoles
      });

      return {
        success: true,
        announcementId: announcement._id,
        notificationsCreated: notifications.length,
        emailsQueued: emailJobs,
        targetRoles,
        targetUserCount: targetUsers.length,
        announcement: {
          _id: announcement._id,
          title,
          message,
          priority,
          targetRoles,
          expiresAt,
          createdAt: announcement.createdAt
        }
      };

    } catch (error) {
      logger.error('Failed to create announcement', error);
      throw error;
    }
  }

  /**
   * Get target users based on roles
   */
  static async getTargetUsers(targetRoles) {
    try {
      const query = {
        role: { $in: targetRoles },
        isActive: true,
        isVerified: true
      };

      const users = await User.find(query).select('_id name email role preferences');
      
      // Filter users who have email notifications enabled
      const emailEnabledUsers = users.filter(user => 
        user.preferences?.emailNotifications !== false
      );

      logger.info('Found target users', {
        totalUsers: users.length,
        emailEnabledUsers: emailEnabledUsers.length,
        targetRoles
      });

      return emailEnabledUsers;
    } catch (error) {
      logger.error('Failed to get target users', error);
      throw error;
    }
  }

  /**
   * Create notifications for users
   */
  static async createNotifications({
    title,
    message,
    targetUsers,
    priority,
    data,
    actions,
    expiresAt
  }) {
    try {
      const notifications = [];

      for (const user of targetUsers) {
        const notification = new Notification({
          title,
          message,
          type: NOTIFICATION_TYPES.ANNOUNCEMENT || 'announcement',
          recipient: user._id,
          priority,
          data: {
            ...data,
            announcementType: 'admin_announcement',
            targetRoles: targetUsers.map(u => u.role)
          },
          actions,
          expiresAt: expiresAt ? new Date(expiresAt) : null
        });

        notifications.push(notification);
      }

      // Bulk insert notifications
      await Notification.insertMany(notifications);
      
      logger.info('Notifications created', { count: notifications.length });
      return notifications;

    } catch (error) {
      logger.error('Failed to create notifications', error);
      throw error;
    }
  }

  /**
   * Queue announcement emails
   */
  static async queueAnnouncementEmails({
    title,
    message,
    targetUsers,
    priority,
    data,
    announcementId
  }) {
    try {
      const emails = targetUsers.map(user => ({
        to: user.email,
        subject: `📢 ${title}`,
        html: this.generateAnnouncementEmailHTML({
          title,
          message,
          userName: user.name,
          priority,
          data
        }),
        announcementId: announcementId
      }));

      // Add emails to queue
      const emailJobIds = await emailQueue.addBulkEmails(emails);
      
      logger.info('Announcement emails queued', { count: emails.length });
      return emailJobIds;

    } catch (error) {
      logger.error('Failed to queue announcement emails', error);
      throw error;
    }
  }

  /**
   * Generate HTML email template for announcements
   */
  static generateAnnouncementEmailHTML({
    title,
    message,
    userName,
    priority,
    data
  }) {
    const priorityColors = {
      urgent: '#dc2626',
      high: '#ea580c',
      medium: '#d97706',
      low: '#16a34a'
    };

    const priorityColor = priorityColors[priority] || priorityColors.medium;

    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>${title}</title>
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; margin: 0; padding: 0; background-color: #f8fafc; }
          .container { max-width: 600px; margin: 0 auto; background-color: #ffffff; }
          .header { background: linear-gradient(135deg, ${priorityColor}, ${priorityColor}dd); padding: 30px; text-align: center; }
          .header h1 { color: white; margin: 0; font-size: 24px; font-weight: 600; }
          .content { padding: 30px; }
          .greeting { font-size: 16px; color: #374151; margin-bottom: 20px; }
          .message { font-size: 16px; color: #4b5563; line-height: 1.6; margin-bottom: 30px; }
          .priority-badge { display: inline-block; background-color: ${priorityColor}; color: white; padding: 4px 12px; border-radius: 20px; font-size: 12px; font-weight: 600; text-transform: uppercase; margin-bottom: 20px; }
          .footer { background-color: #f9fafb; padding: 20px; text-align: center; border-top: 1px solid #e5e7eb; }
          .footer p { margin: 0; color: #6b7280; font-size: 14px; }
          .cta-button { display: inline-block; background-color: ${priorityColor}; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: 600; margin: 20px 0; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>📢 ${title}</h1>
          </div>
          <div class="content">
            <div class="greeting">Hello ${userName},</div>
            <div class="priority-badge">${priority} Priority</div>
            <div class="message">${message.replace(/\n/g, '<br>')}</div>
            <div style="text-align: center;">
              <a href="${process.env.FRONTEND_URL || 'https://bloocube.com'}" class="cta-button">
                View in Bloocube
              </a>
            </div>
          </div>
          <div class="footer">
            <p>This is an important announcement from Bloocube.</p>
            <p>If you no longer wish to receive these emails, you can update your preferences in your account settings.</p>
          </div>
        </div>
      </body>
      </html>
    `;
  }

  /**
   * Get announcement statistics
   */
  static async getAnnouncementStats() {
    try {
      const stats = await Notification.aggregate([
        {
          $match: { type: NOTIFICATION_TYPES.ANNOUNCEMENT || 'announcement' }
        },
        {
          $group: {
            _id: null,
            total: { $sum: 1 },
            unread: {
              $sum: { $cond: [{ $eq: ['$isRead', false] }, 1, 0] }
            },
            byPriority: {
              $push: {
                priority: '$priority',
                isRead: '$isRead'
              }
            }
          }
        }
      ]);

      const result = stats[0] || { total: 0, unread: 0, byPriority: [] };
      
      // Get announcement statistics from Announcement model
      const announcementStats = await Announcement.aggregate([
        {
          $group: {
            _id: null,
            total: { $sum: 1 },
            byPriority: {
              $push: {
                priority: '$priority',
                status: '$status'
              }
            },
            totalEmailsSent: { $sum: '$emailSettings.emailSent' },
            totalEmailsFailed: { $sum: '$emailSettings.emailFailed' },
            totalEmailsPending: { $sum: '$emailSettings.emailPending' }
          }
        }
      ]);

      const announcementResult = announcementStats[0] || { 
        total: 0, 
        byPriority: [], 
        totalEmailsSent: 0, 
        totalEmailsFailed: 0, 
        totalEmailsPending: 0 
      };
      
      // Process priority breakdown from announcements
      const priorityBreakdown = {};
      announcementResult.byPriority.forEach(item => {
        if (!priorityBreakdown[item.priority]) {
          priorityBreakdown[item.priority] = { total: 0, unread: 0 };
        }
        priorityBreakdown[item.priority].total++;
      });

      return {
        total: announcementResult.total,
        unread: result.unread, // Keep notification unread count
        priorityBreakdown,
        totalEmailsSent: announcementResult.totalEmailsSent,
        totalEmailsFailed: announcementResult.totalEmailsFailed,
        totalEmailsPending: announcementResult.totalEmailsPending
      };

    } catch (error) {
      logger.error('Failed to get announcement stats', error);
      throw error;
    }
  }

  /**
   * Get email queue statistics
   */
  static async getEmailQueueStats() {
    try {
      return await emailQueue.getQueueStats();
    } catch (error) {
      logger.error('Failed to get email queue stats', error);
      throw error;
    }
  }

  /**
   * Get detailed email statistics
   */
  static async getDetailedEmailStats() {
    try {
      return await emailQueue.getDetailedEmailStats();
    } catch (error) {
      logger.error('Failed to get detailed email stats', error);
      throw error;
    }
  }

  /**
   * Get comprehensive announcement statistics
   */
  static async getComprehensiveStats() {
    try {
      const [announcementStats, emailStats] = await Promise.all([
        this.getAnnouncementStats(),
        this.getDetailedEmailStats()
      ]);

      return {
        announcements: announcementStats,
        emails: emailStats,
        summary: {
          totalAnnouncements: announcementStats.total,
          totalEmailsQueued: emailStats.total || 0,
          emailsSent: announcementStats.totalEmailsSent || emailStats.completed || 0,
          emailsFailed: announcementStats.totalEmailsFailed || emailStats.failed || 0,
          emailsPending: announcementStats.totalEmailsPending || emailStats.pending || 0,
          successRate: (announcementStats.totalEmailsSent + announcementStats.totalEmailsFailed) > 0 ? 
            ((announcementStats.totalEmailsSent / (announcementStats.totalEmailsSent + announcementStats.totalEmailsFailed)) * 100).toFixed(1) : 
            (emailStats.total > 0 ? ((emailStats.completed / emailStats.total) * 100).toFixed(1) : 0)
        }
      };
    } catch (error) {
      logger.error('Failed to get comprehensive stats', error);
      throw error;
    }
  }

  /**
   * Get list of announcements with pagination and filtering
   */
  static async getAnnouncements(options = {}) {
    try {
      const {
        page = 1,
        limit = 10,
        priority = null,
        targetRole = null,
        search = null,
        createdBy = null
      } = options;

      const result = await Announcement.getAnnouncements({
        page,
        limit,
        priority,
        targetRole,
        search,
        createdBy
      });

      logger.info('Announcements retrieved', {
        page,
        limit,
        total: result.total,
        count: result.announcements.length
      });

      return result;
    } catch (error) {
      logger.error('Failed to get announcements', error);
      throw error;
    }
  }
}

module.exports = AnnouncementService;
