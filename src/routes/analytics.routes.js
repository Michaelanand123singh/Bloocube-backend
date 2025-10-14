// src/routes/analytics.routes.js
const router = require('express').Router();
const { authenticate, authorize } = require('../middlewares/auth');
const { validateWithJoi, analyticsValidation } = require('../utils/validator');
const ctrl = require('../controllers/analyticsController');

// Create analytics record (system/admin)
router.post('/', authenticate, authorize('admin'), validateWithJoi(analyticsValidation.create), ctrl.createAnalytics);

// Get analytics by user
router.get('/user/:userId', authenticate, ctrl.getUserAnalytics);

// Sync analytics from linked accounts
router.post('/user/:userId/sync', authenticate, ctrl.syncUserAnalytics);

// Get top performing posts
router.get('/top', authenticate, ctrl.getTopPerforming);

// Platform stats
router.get('/platform/:platform', authenticate, ctrl.getPlatformStats);

// Time series and success/failure for admin dashboard
router.get('/timeseries/posts', authenticate, authorize('admin'), ctrl.getPostsTimeSeries);
router.get('/success-failure', authenticate, authorize('admin'), ctrl.getSuccessFailure);

module.exports = router;


