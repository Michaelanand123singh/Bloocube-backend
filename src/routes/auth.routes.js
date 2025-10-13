// src/routes/auth.routes.js
const router = require('express').Router();
const { authenticate, validatePasswordResetToken, refreshToken } = require('../middlewares/auth');
const { validateWithJoi, userValidation, validationRules, validateRequest } = require('../utils/validator');
const { authLimiter, passwordResetLimiter } = require('../middlewares/rateLimiter');
const ctrl = require('../controllers/authController');

router.post('/register', (process.env.NODE_ENV === 'production' ? authLimiter : (req,res,next)=>next()), validateWithJoi(userValidation.register), ctrl.register);
// Disable rate limit on login in non-production to avoid 429 during development
router.post('/login', (process.env.NODE_ENV === 'production' ? authLimiter : (req,res,next)=>next()), validateWithJoi(userValidation.login), ctrl.login);

router.get('/me', authenticate, ctrl.getProfile);
router.put('/me', authenticate, validateWithJoi(userValidation.updateProfile), ctrl.updateProfile);
// Note: Password change moved to /api/profile/change-password

router.post('/request-password-reset', passwordResetLimiter, ctrl.requestPasswordReset);
router.post('/reset-password/:token', validatePasswordResetToken, ctrl.resetPassword);

router.post('/logout', authenticate, ctrl.logout);
// Token refresh
router.post('/refresh', refreshToken);

router.get('/verify/:token', ctrl.verifyEmail);
router.post('/resend-verification', authenticate, ctrl.resendVerification);

// Test endpoint to verify authentication
router.get('/test', authenticate, (req, res) => {
  res.json({ 
    success: true, 
    message: 'Authentication working',
    user: {
      id: req.user._id,
      email: req.user.email,
      role: req.user.role
    }
  });
});

module.exports = router;