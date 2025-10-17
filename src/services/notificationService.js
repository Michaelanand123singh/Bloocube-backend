// src/services/notificationService.js
const Notification = require('../models/Notification');
const User = require('../models/User');
const logger = require('../utils/logger');
const { NOTIFICATION_TYPES } = require('../utils/constants');

class NotificationService {
  /**
   * Create a notification for a specific user
   */
  static async createNotification({
    title,
    message,
    type,
    recipientId,
    priority = 'medium',
    data = {},
    relatedResource = null,
    actions = [],
    expiresAt = null
  }) {
    try {
      const notification = new Notification({
        title,
        message,
        type,
        recipient: recipientId,
        priority,
        data,
        relatedResource,
        actions,
        expiresAt: expiresAt ? new Date(expiresAt) : null
      });

      await notification.save();
      await notification.populate('recipient', 'name email role');

      logger.info('Notification created', {
        notificationId: notification._id,
        recipientId,
        type,
        priority
      });

      return notification;
    } catch (error) {
      logger.error('Failed to create notification', error);
      throw error;
    }
  }

  /**
   * Create notifications for all admin users
   */
  static async notifyAdmins({
    title,
    message,
    type,
    priority = 'medium',
    data = {},
    relatedResource = null,
    actions = [],
    expiresAt = null
  }) {
    try {
      const adminUsers = await User.find({ role: 'admin' }).select('_id');
      
      if (adminUsers.length === 0) {
        logger.warn('No admin users found for notification');
        return [];
      }

      const notifications = await Promise.all(
        adminUsers.map(admin => 
          this.createNotification({
            title,
            message,
            type,
            recipientId: admin._id,
            priority,
            data,
            relatedResource,
            actions,
            expiresAt
          })
        )
      );

      logger.info(`Notifications sent to ${adminUsers.length} admin users`, { type });
      return notifications;
    } catch (error) {
      logger.error('Failed to notify admins', error);
      throw error;
    }
  }

  /**
   * Create notification for user registration
   */
  static async notifyUserRegistration(user) {
    return this.notifyAdmins({
      
      title: 'New User Registration',
      message: `New ${user.role} "${user.name}" has registered on the platform.`,
      type: NOTIFICATION_TYPES.USER_ACTIVITY,
      priority: 'medium',
      data: { 
        userId: user._id, 
        userName: user.name, 
        userEmail: user.email,
        userRole: user.role 
      },
      relatedResource: {
        type: 'user',
        id: user._id
      },
      actions: [
        { 
          label: 'View User', 
          action: 'view_user', 
          url: `/users/${user._id}`, 
          style: 'primary' 
        }
      ]
    });
  }

  /**
   * Create notification for new campaign
   */
  static async notifyCampaignCreated(campaign) {
    return this.notifyAdmins({
      title: 'New Campaign Created',
      message: `Brand created a new campaign: "${campaign.title}".`,
      type: NOTIFICATION_TYPES.CAMPAIGN_CREATED,
      priority: 'medium',
      data: { 
        campaignId: campaign._id, 
        campaignTitle: campaign.title,
        brandId: campaign.brand_id,
        budget: campaign.budget
      },
      relatedResource: {
        type: 'campaign',
        id: campaign._id
      },
      actions: [
        { 
          label: 'View Campaign', 
          action: 'view_campaign', 
          url: `/campaigns/${campaign._id}`, 
          style: 'primary' 
        }
      ]
    });
  }

  /**
   * Create notification for new bid
   */
  static async notifyBidReceived(bid, campaign) {
    const notifications = [];
    
    // Notify admins
    try {
      const adminNotifications = await this.notifyAdmins({
        title: 'New Bid Received',
        message: `Creator submitted a bid for campaign "${campaign.title}".`,
        type: NOTIFICATION_TYPES.BID_RECEIVED,
        priority: 'medium',
        data: { 
          bidId: bid._id, 
          campaignId: campaign._id,
          campaignTitle: campaign.title,
          creatorId: bid.creator_id,
          bidAmount: bid.bid_amount
        },
        relatedResource: {
          type: 'bid',
          id: bid._id
        },
        actions: [
          { 
            label: 'Review Bid', 
            action: 'review_bid', 
            url: `/bids/${bid._id}`, 
            style: 'primary' 
          }
        ]
      });
      notifications.push(...adminNotifications);
    } catch (error) {
      logger.error('Failed to notify admins about new bid', error);
    }
    
    // Notify the brand owner
    try {
      logger.info('Creating brand notification for new bid', { 
        brandId: campaign.brand_id, 
        bidId: bid._id,
        campaignId: campaign._id,
        campaignTitle: campaign.title
      });
      
      const brandNotification = await this.createNotification({
        title: 'New Bid on Your Campaign',
        message: `You received a new bid for your campaign "${campaign.title}".`,
        type: NOTIFICATION_TYPES.BID_RECEIVED,
        recipientId: campaign.brand_id,
        priority: 'high',
        data: { 
          bidId: bid._id, 
          campaignId: campaign._id,
          campaignTitle: campaign.title,
          creatorId: bid.creator_id,
          bidAmount: bid.bid_amount || bid.amount
        },
        relatedResource: {
          type: 'bid',
          id: bid._id
        },
        actions: [
          { 
            label: 'View Bid', 
            action: 'view_bid', 
            url: `/brand/campaigns?viewBids=${bid._id}`, 
            style: 'primary' 
          },
          { 
            label: 'View Campaign', 
            action: 'view_campaign', 
            url: `/brand/campaigns`, 
            style: 'secondary' 
          }
        ]
      });
      notifications.push(brandNotification);
      logger.info('Brand notification created successfully for new bid', { 
        brandId: campaign.brand_id, 
        bidId: bid._id,
        campaignId: campaign._id,
        notificationId: brandNotification._id
      });
    } catch (error) {
      logger.error('Failed to notify brand about new bid', { 
        error: error.message, 
        stack: error.stack,
        brandId: campaign.brand_id,
        bidId: bid._id,
        campaignId: campaign._id
      });
    }
    
    return notifications;
  }

  /**
   * Create notification for bid acceptance
   */
  static async notifyBidAccepted(bid, campaign, creatorId) {
    return this.createNotification({
      title: 'Bid Accepted',
      message: `Your bid for campaign "${campaign.title}" has been accepted!`,
      type: NOTIFICATION_TYPES.BID_ACCEPTED,
      recipientId: creatorId,
      priority: 'high',
      data: { 
        bidId: bid._id, 
        campaignId: campaign._id,
        campaignTitle: campaign.title,
        bidAmount: bid.amount
      },
      relatedResource: {
        type: 'bid',
        id: bid._id
      },
      actions: [
        { 
          label: 'View Campaign', 
          action: 'view_campaign', 
          url: `/campaigns/${campaign._id}`, 
          style: 'success' 
        }
      ]
    });
  }

  /**
   * Create notification for bid rejection
   */
  static async notifyBidRejected(bid, campaign, creatorId) {
    return this.createNotification({
      title: 'Bid Rejected',
      message: `Your bid for campaign "${campaign.title}" was not selected.`,
      type: NOTIFICATION_TYPES.BID_REJECTED,
      recipientId: creatorId,
      priority: 'medium',
      data: { 
        bidId: bid._id, 
        campaignId: campaign._id,
        campaignTitle: campaign.title,
        bidAmount: bid.amount
      },
      relatedResource: {
        type: 'bid',
        id: bid._id
      }
    });
  }

  /**
   * Create notification for campaign deadline
   */
  static async notifyCampaignDeadline(campaign, daysLeft) {
    return this.notifyAdmins({
      title: 'Campaign Deadline Approaching',
      message: `Campaign "${campaign.title}" deadline is in ${daysLeft} day${daysLeft > 1 ? 's' : ''}.`,
      type: NOTIFICATION_TYPES.CAMPAIGN_DEADLINE,
      priority: daysLeft <= 1 ? 'urgent' : 'high',
      data: { 
        campaignId: campaign._id, 
        campaignTitle: campaign.title,
        daysLeft,
        deadline: campaign.deadline
      },
      relatedResource: {
        type: 'campaign',
        id: campaign._id
      },
      actions: [
        { 
          label: 'View Campaign', 
          action: 'view_campaign', 
          url: `/campaigns/${campaign._id}`, 
          style: 'primary' 
        }
      ]
    });
  }

  /**
   * Create notification for payment received
   */
  static async notifyPaymentReceived(payment, userId) {
    return this.createNotification({
      title: 'Payment Received',
      message: `Payment of $${payment.amount} received for completed work.`,
      type: NOTIFICATION_TYPES.PAYMENT_RECEIVED,
      recipientId: userId,
      priority: 'high',
      data: { 
        paymentId: payment._id,
        amount: payment.amount,
        currency: payment.currency || 'USD',
        transactionId: payment.transactionId
      },
      relatedResource: {
        type: 'payment',
        id: payment._id
      },
      actions: [
        { 
          label: 'View Details', 
          action: 'view_payment', 
          url: `/payments/${payment._id}`, 
          style: 'success' 
        }
      ]
    });
  }

  /**
   * Create notification for analytics update
   */
  static async notifyAnalyticsUpdate(analytics, userId) {
    return this.createNotification({
      title: 'Analytics Update',
      message: `Your content performance has been updated with new metrics.`,
      type: NOTIFICATION_TYPES.ANALYTICS_UPDATE,
      recipientId: userId,
      priority: 'low',
      data: { 
        analyticsId: analytics._id,
        platform: analytics.platform,
        metrics: analytics.metrics
      },
      relatedResource: {
        type: 'analytics',
        id: analytics._id
      },
      actions: [
        { 
          label: 'View Analytics', 
          action: 'view_analytics', 
          url: `/analytics/${analytics._id}`, 
          style: 'primary' 
        }
      ]
    });
  }

  /**
   * Create notification for AI suggestion
   */
  static async notifyAISuggestion(suggestion, userId) {
    return this.createNotification({
      title: 'AI Suggestion Available',
      message: `New AI-powered suggestions are available for your content strategy.`,
      type: NOTIFICATION_TYPES.AI_SUGGESTION,
      recipientId: userId,
      priority: 'low',
      data: { 
        suggestionId: suggestion._id,
        category: suggestion.category,
        confidence: suggestion.confidence
      },
      relatedResource: {
        type: 'ai_suggestion',
        id: suggestion._id
      },
      actions: [
        { 
          label: 'View Suggestions', 
          action: 'view_suggestions', 
          url: `/ai/suggestions/${suggestion._id}`, 
          style: 'primary' 
        }
      ]
    });
  }

  /**
   * Create system alert notification
   */
  static async notifySystemAlert(alert) {
    return this.notifyAdmins({
      title: 'System Alert',
      message: alert.message,
      type: NOTIFICATION_TYPES.SYSTEM_ALERT,
      priority: alert.priority || 'high',
      data: alert.data || {},
      actions: alert.actions || []
    });
  }

  /**
   * Clean up expired notifications
   */
  static async cleanupExpiredNotifications() {
    try {
      const result = await Notification.deleteMany({
        expiresAt: { $lt: new Date() }
      });
      
      if (result.deletedCount > 0) {
        logger.info(`Cleaned up ${result.deletedCount} expired notifications`);
      }
      
      return result.deletedCount;
    } catch (error) {
      logger.error('Failed to cleanup expired notifications', error);
      throw error;
    }
  }
}

module.exports = NotificationService;
