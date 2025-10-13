// src/controllers/notificationController.js
const Notification = require('../models/Notification');
const { HTTP_STATUS, NOTIFICATION_TYPES } = require('../utils/constants');
const { asyncHandler } = require('../middlewares/errorHandler');
const logger = require('../utils/logger');

/**
 * Get notifications for the authenticated user
 */
const getNotifications = asyncHandler(async (req, res) => {
  const {
    page = 1,
    limit = 20,
    unreadOnly = false,
    type = null,
    priority = null
  } = req.query;

  const userId = req.userId;
  const options = {
    page: parseInt(page),
    limit: parseInt(limit),
    unreadOnly: unreadOnly === 'true',
    type,
    priority
  };

  const notifications = await Notification.getUserNotifications(userId, options);
  const total = await Notification.countDocuments({ recipient: userId });
  const unreadCount = await Notification.getUnreadCount(userId);

  logger.info('User fetched notifications', {
    userId,
    count: notifications.length,
    unreadCount
  });

  res.json({
    success: true,
    data: {
      notifications,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit))
      },
      unreadCount
    }
  });
});

/**
 * Get unread notification count
 */
const getUnreadCount = asyncHandler(async (req, res) => {
  const userId = req.userId;
  const count = await Notification.getUnreadCount(userId);

  res.json({
    success: true,
    data: { unreadCount: count }
  });
});

/**
 * Mark a notification as read
 */
const markAsRead = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const userId = req.userId;

  const notification = await Notification.findOneAndUpdate(
    { _id: id, recipient: userId },
    { isRead: true },
    { new: true }
  );

  if (!notification) {
    return res.status(HTTP_STATUS.NOT_FOUND).json({
      success: false,
      message: 'Notification not found'
    });
  }

  logger.info('Notification marked as read', { userId, notificationId: id });

  res.json({
    success: true,
    data: { notification }
  });
});

/**
 * Mark all notifications as read for the user
 */
const markAllAsRead = asyncHandler(async (req, res) => {
  const userId = req.userId;
  
  const result = await Notification.markAllAsRead(userId);
  
  logger.info('All notifications marked as read', { 
    userId, 
    modifiedCount: result.modifiedCount 
  });

  res.json({
    success: true,
    data: { modifiedCount: result.modifiedCount }
  });
});

/**
 * Delete a notification
 */
const deleteNotification = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const userId = req.userId;

  const notification = await Notification.findOneAndDelete({
    _id: id,
    recipient: userId
  });

  if (!notification) {
    return res.status(HTTP_STATUS.NOT_FOUND).json({
      success: false,
      message: 'Notification not found'
    });
  }

  logger.info('Notification deleted', { userId, notificationId: id });

  res.json({
    success: true,
    data: { id }
  });
});

/**
 * Create a notification (admin only)
 */
const createNotification = asyncHandler(async (req, res) => {
  const {
    title,
    message,
    type,
    recipient,
    priority = 'medium',
    data = {},
    relatedResource = null,
    actions = [],
    expiresAt = null
  } = req.body;

  // Validate required fields
  if (!title || !message || !type || !recipient) {
    return res.status(HTTP_STATUS.BAD_REQUEST).json({
      success: false,
      message: 'Title, message, type, and recipient are required'
    });
  }

  // Validate notification type
  if (!Object.values(NOTIFICATION_TYPES).includes(type)) {
    return res.status(HTTP_STATUS.BAD_REQUEST).json({
      success: false,
      message: 'Invalid notification type'
    });
  }

  const notification = new Notification({
    title,
    message,
    type,
    recipient,
    priority,
    data,
    relatedResource,
    actions,
    expiresAt: expiresAt ? new Date(expiresAt) : null
  });

  await notification.save();
  await notification.populate('recipient', 'name email role');

  logger.info('Notification created', {
    createdBy: req.userId,
    recipient,
    type,
    notificationId: notification._id
  });

  res.status(HTTP_STATUS.CREATED).json({
    success: true,
    data: { notification }
  });
});

/**
 * Get notification statistics (admin only)
 */
const getNotificationStats = asyncHandler(async (req, res) => {
  const stats = await Notification.aggregate([
    {
      $group: {
        _id: null,
        total: { $sum: 1 },
        unread: {
          $sum: { $cond: [{ $eq: ['$isRead', false] }, 1, 0] }
        },
        byType: {
          $push: {
            type: '$type',
            isRead: '$isRead'
          }
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

  // Process type and priority breakdowns
  const typeBreakdown = {};
  const priorityBreakdown = {};

  if (stats.length > 0) {
    stats[0].byType.forEach(item => {
      if (!typeBreakdown[item.type]) {
        typeBreakdown[item.type] = { total: 0, unread: 0 };
      }
      typeBreakdown[item.type].total++;
      if (!item.isRead) typeBreakdown[item.type].unread++;
    });

    stats[0].byPriority.forEach(item => {
      if (!priorityBreakdown[item.priority]) {
        priorityBreakdown[item.priority] = { total: 0, unread: 0 };
      }
      priorityBreakdown[item.priority].total++;
      if (!item.isRead) priorityBreakdown[item.priority].unread++;
    });
  }

  const result = {
    total: stats[0]?.total || 0,
    unread: stats[0]?.unread || 0,
    typeBreakdown,
    priorityBreakdown
  };

  logger.info('Notification stats retrieved', { requestedBy: req.userId });

  res.json({
    success: true,
    data: result
  });
});

module.exports = {
  getNotifications,
  getUnreadCount,
  markAsRead,
  markAllAsRead,
  deleteNotification,
  createNotification,
  getNotificationStats
};
