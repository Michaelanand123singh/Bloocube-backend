// src/routes/linkedin.routes.js
const router = require('express').Router();
const { authenticate, optionalAuth } = require('../middlewares/auth');
const controller = require('../controllers/linkedinController');

// Auth URL generation should NOT require authentication - it's used to initiate login
router.post('/auth-url', optionalAuth, controller.generateAuthURL);
router.get('/auth-url', optionalAuth, controller.generateAuthURL);
router.get('/callback', controller.handleCallback);
router.post('/save-connection', authenticate, controller.saveConnection);


// Connection status and profile
router.get('/status', authenticate, controller.getStatus);
router.get('/profile', authenticate, controller.getProfile);

// Disconnect LinkedIn account
router.delete('/disconnect', authenticate, controller.disconnect);

// Debug endpoints
router.get('/ping', (req, res) => res.json({ ok: true }));
router.get('/config', (req, res) => {
  const config = require('../config/env');
  res.json({
    hasClientId: !!config.LINKEDIN_CLIENT_ID,
    hasClientSecret: !!config.LINKEDIN_CLIENT_SECRET,
    scopes: config.LINKEDIN_SCOPES,
    redirectUri: process.env.LINKEDIN_REDIRECT_URI,
    clientIdPreview: config.LINKEDIN_CLIENT_ID ? config.LINKEDIN_CLIENT_ID.substring(0, 8) + '...' : 'Not set'
  });
});

module.exports = router;


