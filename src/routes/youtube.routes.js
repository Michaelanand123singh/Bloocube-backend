// youtube.routes.js
const express = require('express');
const router = express.Router();
const youtubeController = require('../controllers/youtubeController');
const { authenticate, optionalAuth } = require('../middlewares/auth');
const { upload, persistUploads } = require('../middlewares/upload');

// Public routes (require app auth to associate user)
router.post('/auth-url', optionalAuth, youtubeController.generateAuthURL);
router.get('/auth-url', optionalAuth, youtubeController.generateAuthURL);
router.get('/callback', youtubeController.handleCallback);

// Protected routes for YouTube data/actions
router.get('/channel', authenticate, youtubeController.getChannelInfo);
router.get('/status', authenticate, youtubeController.getStatus);
router.delete('/disconnect', authenticate, youtubeController.disconnect);
router.post('/upload-video', authenticate, upload.single('video'), persistUploads, youtubeController.uploadVideo);
router.get('/video/:videoId/analytics', authenticate, youtubeController.getVideoAnalytics);

// Test route to verify callback is accessible
router.get('/callback-test', (req, res) => {
  res.json({ success: true, message: 'YouTube callback route is accessible', timestamp: new Date().toISOString() });
});

// Remove duplicate protected route definitions to avoid conflicts

module.exports = router;
