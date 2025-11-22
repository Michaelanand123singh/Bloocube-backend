// src/routes/adminAuth.routes.js
// Admin-specific authentication routes that bypass rate limiting
const router = require('express').Router();
const { authenticate, refreshToken } = require('../middlewares/auth');
const tokenBlacklist = require('../services/tokenBlacklist');
const { validateWithJoi, userValidation } = require('../utils/validator');
const ctrl = require('../controllers/authController');

// Admin login - NO rate limiting applied (handled by dynamicLimiter bypass for /api/admin routes)
router.post('/login', validateWithJoi(userValidation.login), ctrl.login);

// Admin logout
router.post('/logout', authenticate, ctrl.logout);

// Token refresh for admin
router.post('/refresh', refreshToken);

// Revoke token endpoint for admin
router.post('/revoke', authenticate, async (req, res) => {
  try {
    const access = req.cookies?.access_token || (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
    if (access) await tokenBlacklist.blacklistToken(access);
    return res.json({ success: true, message: 'Access token revoked' });
  } catch {
    return res.status(500).json({ success: false, message: 'Failed to revoke token' });
  }
});

module.exports = router;

