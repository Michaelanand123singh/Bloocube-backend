// src/routes/analytics.routes.js
const router = require('express').Router();
const { authenticate, authorize } = require('../middlewares/auth');
const { validateWithJoi, analyticsValidation } = require('../utils/validator');
const ctrl = require('../controllers/analyticsController');

// Create analytics record (system/admin)
router.post('/', authenticate, authorize('admin'), validateWithJoi(analyticsValidation.create), ctrl.createAnalytics);

// Get analytics by user
router.get('/user/:userId', authenticate, ctrl.getUserAnalytics);

// Get top performing posts
router.get('/top', authenticate, ctrl.getTopPerforming);

// Platform stats
router.get('/platform/:platform', authenticate, ctrl.getPlatformStats);

module.exports = router;


