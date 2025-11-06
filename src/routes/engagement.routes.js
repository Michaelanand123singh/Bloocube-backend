// src/routes/engagement.routes.js
const express = require('express');
const router = express.Router();
const engagementController = require('../controllers/engagementController');
const { authenticate } = require('../middlewares/auth');
const { param, query } = require('express-validator');

// Validation rules
const platformValidation = [
  param('platform')
    .isIn(['twitter', 'youtube', 'instagram', 'linkedin', 'facebook'])
    .withMessage('Platform must be one of: twitter, youtube, instagram, linkedin, facebook')
];

const paginationValidation = [
  query('page')
    .optional()
    .isInt({ min: 1 })
    .withMessage('Page must be a positive integer'),
  query('limit')
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage('Limit must be between 1 and 100'),
  query('platform')
    .optional()
    .isIn(['twitter', 'youtube', 'instagram', 'linkedin', 'facebook'])
    .withMessage('Platform must be one of: twitter, youtube, instagram, linkedin, facebook')
];

const postIdValidation = [
  param('postId')
    .isMongoId()
    .withMessage('Invalid post ID')
];

// All routes require authentication
router.use(authenticate);

// Get engagement metrics for all connected platforms
router.get('/', engagementController.getAllPlatformEngagement);

// Get engagement metrics for a specific platform
router.get('/:platform', platformValidation, engagementController.getPlatformEngagement);

// Get platform support information
router.get('/platforms/support', engagementController.getPlatformSupport);

// Get user's published posts with platform links
router.get('/posts/all', paginationValidation, engagementController.getUserPublishedPosts);

// Sync engagement metrics for a specific post
router.post('/posts/:postId/sync', postIdValidation, engagementController.syncPostMetrics);

module.exports = router;

