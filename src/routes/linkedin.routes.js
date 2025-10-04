// src/routes/linkedin.routes.js
const router = require('express').Router();
const { authenticate } = require('../middlewares/auth');
const controller = require('../controllers/linkedinController');

router.post('/auth-url', authenticate, controller.generateAuthURL);
router.get('/auth-url', authenticate, controller.generateAuthURL);
router.get('/callback', controller.handleCallback);

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


