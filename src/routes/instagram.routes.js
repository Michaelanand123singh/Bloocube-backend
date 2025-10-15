// instagram.routes.js
const express = require('express');
const router = express.Router();
const instagramController = require('../controllers/instagramController');
const { authenticate } = require('../middlewares/auth');
const { upload, persistUploads } = require('../middlewares/upload');

// ===== PUBLIC ROUTES =====
// OAuth flow routes (no authentication required)
router.post('/auth-url', authenticate, instagramController.generateAuthURL);
router.get('/callback', instagramController.handleCallback);

// Test route
router.get('/callback-test', (req, res) => {
  res.json({ 
    success: true, 
    message: 'Instagram routes are working', 
    timestamp: new Date().toISOString() 
  });
});

// ===== PROTECTED ROUTES =====
// All routes below require authentication
router.use(authenticate);

// Account management
router.get('/profile', instagramController.getProfile);
router.get('/validate', instagramController.validateConnection);
router.delete('/disconnect', instagramController.disconnect);

// Content posting - main endpoint for all post types
router.post('/post', instagramController.postContent); // Handles: post, story

// Media management
router.post('/upload-media', upload.single('media'), persistUploads, instagramController.uploadMedia);

// Analytics and insights
router.get('/insights', instagramController.getInsights);

module.exports = router;
