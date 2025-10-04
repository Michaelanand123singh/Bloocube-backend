// twitter.routes.js
const express = require('express');
const router = express.Router();
const twitterController = require('../controllers/twitterController');
const { authenticate } = require('../middlewares/auth');
const upload = require('../middlewares/upload');

// ===== PUBLIC ROUTES =====
// OAuth flow routes (no authentication required)
router.post('/auth-url', authenticate, twitterController.generateAuthURL); // POST preferred for auth URL
router.get('/callback', twitterController.handleCallback);

// Test route
router.get('/callback-test', (req, res) => {
  res.json({ 
    success: true, 
    message: 'Twitter routes are working', 
    timestamp: new Date().toISOString() 
  });
});

// ===== PROTECTED ROUTES =====
// All routes below require authentication
router.use(authenticate);

// Account management
router.get('/profile', twitterController.getProfile);
router.get('/validate', twitterController.validateConnection);
router.delete('/disconnect', twitterController.disconnect);

// Content posting - main endpoint for all post types
router.post('/post', twitterController.postContent); // Handles: post, thread, poll

// Media management
router.post('/upload-media', upload.single('media'), twitterController.uploadMedia);
router.get('/media-status/:mediaId', twitterController.checkMediaStatus);

module.exports = router;