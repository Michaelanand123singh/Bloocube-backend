const express = require('express');
const router = express.Router();
const instagramController = require('../controllers/instagramController');
const { authenticate, optionalAuth } = require('../middlewares/auth');
const { upload, persistUploads } = require('../middlewares/upload');

// ===== PUBLIC ROUTES =====
// OAuth flow routes (no authentication required for the endpoint itself)
router.post('/auth-url', optionalAuth, instagramController.generateAuthURL);
router.get('/callback', instagramController.handleCallback);

// ===== PROTECTED ROUTES =====
// All routes below require authentication
router.use(authenticate);

// Account management
router.get('/profile', instagramController.getProfile);
router.get('/status', instagramController.getStatus);
router.get('/validate', instagramController.validateConnection);
router.delete('/disconnect', instagramController.disconnect);
// ADDED: Route for refreshing the access token
router.post('/refresh-token', instagramController.refreshToken);

// Content posting - main endpoint for all post types
router.post('/post', instagramController.postContent); // Handles: post, story

// Media management
router.post('/upload-media', upload.single('media'), persistUploads, instagramController.uploadMedia);

// Analytics and insights
router.get('/insights', instagramController.getInsights);

module.exports = router;