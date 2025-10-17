// src/routes/notification.routes.js
const router = require('express').Router();
const { authenticate, authorize } = require('../middlewares/auth');
const notificationController = require('../controllers/notificationController');
const { body, param, query } = require('express-validator');

// All notification routes require authentication
router.use(authenticate);

// Get user's notifications
router.get('/',
  [
    query('page').optional().isInt({ min: 1 }).withMessage('Page must be a positive integer'),
    query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Limit must be between 1 and 100'),
    query('unreadOnly').optional().isBoolean().withMessage('unreadOnly must be a boolean'),
    query('type').optional().isString().withMessage('Type must be a string'),
    query('priority').optional().isIn(['low', 'medium', 'high', 'urgent']).withMessage('Invalid priority')
  ],
  notificationController.getNotifications
);

// Get unread count
router.get('/unread-count', notificationController.getUnreadCount);

// Mark notification as read
router.patch('/:id/read',
  [
    param('id').isMongoId().withMessage('Invalid notification ID')
  ],
  notificationController.markAsRead
);

// Mark all notifications as read
router.patch('/mark-all-read', notificationController.markAllAsRead);

// Delete notification
router.delete('/:id',
  [
    param('id').isMongoId().withMessage('Invalid notification ID')
  ],
  notificationController.deleteNotification
);

// Admin-only routes
router.use(authorize('admin'));

// Create notification (admin only)
router.post('/',
  [
    body('title').isLength({ min: 1, max: 200 }).withMessage('Title must be between 1 and 200 characters'),
    body('message').isLength({ min: 1, max: 1000 }).withMessage('Message must be between 1 and 1000 characters'),
    body('type').isIn([
      'campaign_created',
      'bid_received',
      'bid_accepted', 
      'bid_rejected',
      'campaign_deadline',
      'payment_received',
      'analytics_update',
      'ai_suggestion',
      'system_alert',
      'user_activity'
    ]).withMessage('Invalid notification type'),
    body('recipient').isMongoId().withMessage('Recipient must be a valid user ID'),
    body('priority').optional().isIn(['low', 'medium', 'high', 'urgent']).withMessage('Invalid priority'),
    body('data').optional().isObject().withMessage('Data must be an object'),
    body('relatedResource').optional().isObject().withMessage('Related resource must be an object'),
    body('actions').optional().isArray().withMessage('Actions must be an array'),
    body('expiresAt').optional().isISO8601().withMessage('Expires at must be a valid date')
  ],
  notificationController.createNotification
);

// Get notification statistics (admin only)
router.get('/stats', notificationController.getNotificationStats);

// Announcement routes (admin only)
router.use(authorize('admin'));
router.get('/announcements', notificationController.getAnnouncements);
router.post('/announcement', notificationController.createAnnouncement);
router.get('/announcement-stats', notificationController.getAnnouncementStats);
router.get('/email-queue-stats', notificationController.getEmailQueueStats);
router.get('/comprehensive-stats', notificationController.getComprehensiveStats);

module.exports = router;
