// src/controllers/authController.js
const User = require('../models/User');
const dns = require('dns').promises;
const jwtManager = require('../utils/jwt');
const logger = require('../utils/logger');
const { HTTP_STATUS, SUCCESS_MESSAGES, ERROR_MESSAGES } = require('../utils/constants');
const { asyncHandler } = require('../middlewares/errorHandler');
const { setAuthCookies, clearAuthCookies, updateUserDataCookie } = require('../utils/cookies');
const tokenBlacklist = require('../services/tokenBlacklist');
/**
 * Check if email already exists
 */
const checkEmail = asyncHandler(async (req, res) => {
  const email = String(req.query.email || '').toLowerCase().trim();
  if (!email) {
    return res.status(HTTP_STATUS.BAD_REQUEST).json({ success: false, message: 'Email is required' });
  }
  const existingUser = await User.findByEmail(email);
  return res.json({ success: true, data: { exists: !!existingUser } });
});

/**
 * Register a new user
 */
const register = asyncHandler(async (req, res) => {
  const { name, email, password, role = 'creator', profile } = req.body;

  // Check if user already exists
  const existingUser = await User.findByEmail(email);
  if (existingUser) {
    return res.status(HTTP_STATUS.CONFLICT).json({
      success: false,
      message: ERROR_MESSAGES.USER_ALREADY_EXISTS
    });
  }

  // Optional MX record verification
  try {
    if (process.env.VERIFY_EMAIL_MX === 'true') {
      const domain = email.split('@')[1];
      const mx = await dns.resolveMx(domain);
      if (!mx || mx.length === 0) {
        return res.status(HTTP_STATUS.BAD_REQUEST).json({
          success: false,
          message: 'Email domain does not accept mail'
        });
      }
    }
  } catch (e) {
    return res.status(HTTP_STATUS.BAD_REQUEST).json({ success: false, message: 'Invalid email domain' });
  }

  // Create new user
  const user = new User({
    name,
    email,
    password,
    role,
    profile
  });

  await user.save();

  // Do NOT auto-login; require email verification first

  // Generate and send OTP for 2FA verification
  try {
    const otpCode = user.generateOTP();
    await user.save();
    
    const emailService = require('../services/notifier/email');
    await emailService.sendOTPEmail(user.email, otpCode);
    
    logger.info('OTP sent for user registration', { userId: user._id, email: user.email });
  } catch (e) {
    logger.error('Failed to send OTP email', e);
  }

  // Create notification for admin users
  try {
    const NotificationService = require('../services/notificationService');
    await NotificationService.notifyUserRegistration(user);
  } catch (e) {
    logger.error('Failed to create user registration notification', e);
  }

  logger.info('User registered successfully', { userId: user._id, email: user.email });

  res.status(HTTP_STATUS.CREATED).json({
    success: true,
    message: 'Registration successful! Please check your email for the verification code.',
    data: {
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        profile: user.profile,
        isActive: user.isActive,
        isVerified: user.isVerified
      },
      requiresOTP: true
    }
  });
});

/**
 * Login user
 */
const login = asyncHandler(async (req, res) => {
  const { email, password } = req.body;

  // Find user and include password for comparison
  const user = await User.findByEmail(email).select('+password');
  if (!user) {
    return res.status(HTTP_STATUS.UNAUTHORIZED).json({
      success: false,
      message: ERROR_MESSAGES.INVALID_CREDENTIALS
    });
  }

  // Check if user is active
  if (!user.isActive) {
    return res.status(HTTP_STATUS.UNAUTHORIZED).json({
      success: false,
      message: 'Account is deactivated'
    });
  }

  // Verify password
  const isPasswordValid = await user.comparePassword(password);
  if (!isPasswordValid) {
    return res.status(HTTP_STATUS.UNAUTHORIZED).json({
      success: false,
      message: ERROR_MESSAGES.INVALID_CREDENTIALS
    });
  }

  // Generate tokens
  const tokenPair = jwtManager.generateTokenPair({
    id: user._id,
    email: user.email,
    role: user.role
  });

  // Update last login
  user.lastLogin = new Date();
  await user.save();

  // Set secure HttpOnly cookies
  setAuthCookies(res, tokenPair.accessToken, tokenPair.refreshToken, user);

  logger.info('User logged in successfully', { userId: user._id, email: user.email });

  res.json({
    success: true,
    message: SUCCESS_MESSAGES.LOGIN_SUCCESS,
    data: {
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        profile: user.profile,
        isActive: user.isActive,
        isVerified: user.isVerified,
        lastLogin: user.lastLogin
      }
      // Tokens are now in HttpOnly cookies, not in response body
    }
  });
});

/**
 * Get current user profile
 */
const getProfile = asyncHandler(async (req, res) => {
  const user = await User.findById(req.userId).select('-password');
  
  res.json({
    success: true,
    data: { user }
  });
});

/**
 * Update user profile
 */
const updateProfile = asyncHandler(async (req, res) => {
  const { name, profile } = req.body;
  const userId = req.userId;

  const user = await User.findById(userId);
  if (!user) {
    return res.status(HTTP_STATUS.NOT_FOUND).json({
      success: false,
      message: ERROR_MESSAGES.USER_NOT_FOUND
    });
  }

  // Update fields
  if (name) user.name = name;
  if (profile) {
    if (profile.bio !== undefined) user.profile.bio = profile.bio;
    if (profile.avatar_url !== undefined) user.profile.avatar_url = profile.avatar_url;
    if (profile.social_links) {
      Object.assign(user.profile.social_links, profile.social_links);
    }
  }

  await user.save();

  logger.info('User profile updated', { userId });

  res.json({
    success: true,
    message: SUCCESS_MESSAGES.USER_UPDATED,
    data: { user }
  });
});

// Note: Password change functionality moved to profileController.js
// This endpoint is deprecated - use /api/profile/change-password instead

// ...existing code...
const emailService = require('../services/notifier/email');
// ...existing code...

const requestPasswordReset = asyncHandler(async (req, res) => {
  const { email } = req.body;

  const user = await User.findByEmail(email);
  if (!user) {
    // Don't reveal if user exists or not
    return res.json({
      success: true,
      message: 'If an account with that email exists, a password reset link has been sent'
    });
  }

  // Generate password reset token
  const resetToken = jwtManager.generatePasswordResetToken(user._id);

  // Send email with reset token
  const resetUrl = `${process.env.CORS_ORIGIN || 'http://localhost:3000'}/reset-password/${resetToken}`;
  await emailService.sendPasswordResetEmail(user.email, resetUrl);

  logger.info('Password reset requested', { userId: user._id, email: user.email });

  res.json({
    success: true,
    message: 'If an account with that email exists, a password reset link has been sent'
  });
});
// ...existing code...

/**
 * Reset password
 */
const resetPassword = asyncHandler(async (req, res) => {
  const { newPassword } = req.body;
  const userId = req.userId;

  const user = await User.findById(userId);
  if (!user) {
    return res.status(HTTP_STATUS.NOT_FOUND).json({
      success: false,
      message: ERROR_MESSAGES.USER_NOT_FOUND
    });
  }

  // Update password
  user.password = newPassword;
  await user.save();

  logger.info('Password reset successfully', { userId });

  res.json({
    success: true,
    message: SUCCESS_MESSAGES.PASSWORD_RESET_SUCCESS
  });
});

/**
 * Logout user
 */
const logout = asyncHandler(async (req, res) => {
  // Attempt to blacklist current access and refresh tokens (if present)
  try {
    const access = req.cookies?.access_token;
    const refresh = req.cookies?.refresh_token;
    if (access) await tokenBlacklist.blacklistToken(access);
    if (refresh) await tokenBlacklist.blacklistToken(refresh);
  } catch (e) {
    logger.warn('Failed to blacklist tokens during logout');
  }

  // Clear all authentication cookies
  clearAuthCookies(res);
  
  logger.info('User logged out', { userId: req.userId });

  res.json({
    success: true,
    message: SUCCESS_MESSAGES.LOGOUT_SUCCESS
  });
});

/**
 * Delete user account
 */
const deleteAccount = asyncHandler(async (req, res) => {
  const userId = req.userId;

  const user = await User.findById(userId);
  if (!user) {
    return res.status(HTTP_STATUS.NOT_FOUND).json({
      success: false,
      message: ERROR_MESSAGES.USER_NOT_FOUND
    });
  }

  // Soft delete - deactivate account
  user.isActive = false;
  await user.save();

  logger.info('User account deleted', { userId });

  res.json({
    success: true,
    message: SUCCESS_MESSAGES.USER_DELETED
  });
});

/**
 * Verify email
 */
const verifyEmail = asyncHandler(async (req, res) => {
  const { token } = req.params;
  const jwtManager = require('../utils/jwt');
  try {
    const decoded = jwtManager.verifyAccessToken(token);
    if (decoded.type !== 'email_verify') {
      return res.status(HTTP_STATUS.BAD_REQUEST).json({ success: false, message: 'Invalid token' });
    }
    const user = await User.findById(decoded.id);
    if (!user) {
      return res.status(HTTP_STATUS.NOT_FOUND).json({ success: false, message: ERROR_MESSAGES.USER_NOT_FOUND });
    }
    user.isVerified = true;
    await user.save();
    res.json({ success: true, message: 'Email verified successfully' });
  } catch (e) {
    return res.status(HTTP_STATUS.BAD_REQUEST).json({ success: false, message: e.message || 'Invalid token' });
  }
});

/**
 * Resend verification email
 */
const resendVerification = asyncHandler(async (req, res) => {
  const userId = req.userId;

  const user = await User.findById(userId);
  if (!user) {
    return res.status(HTTP_STATUS.NOT_FOUND).json({
      success: false,
      message: ERROR_MESSAGES.USER_NOT_FOUND
    });
  }

  if (user.isVerified) {
    return res.status(HTTP_STATUS.BAD_REQUEST).json({
      success: false,
      message: 'Email is already verified'
    });
  }

  // TODO: Send verification email
  // await emailService.sendVerificationEmail(user.email, verificationToken);

  logger.info('Verification email resent', { userId });

  res.json({
    success: true,
    message: 'Verification email sent'
  });
});

/**
 * Verify OTP for registration
 */
const verifyOTP = asyncHandler(async (req, res) => {
  const { email, otp } = req.body;

  if (!email || !otp) {
    return res.status(HTTP_STATUS.BAD_REQUEST).json({
      success: false,
      message: 'Email and OTP are required'
    });
  }

  const user = await User.findByEmail(email).select('+otp.code +otp.expiresAt +otp.attempts');
  if (!user) {
    return res.status(HTTP_STATUS.NOT_FOUND).json({
      success: false,
      message: 'User not found'
    });
  }

  const verification = user.verifyOTP(otp);
  if (!verification.valid) {
    await user.save(); // Save attempt count
    return res.status(HTTP_STATUS.BAD_REQUEST).json({
      success: false,
      message: verification.message
    });
  }

  // Mark user as verified and active
  user.isVerified = true;
  user.isActive = true;
  await user.save();

  // Generate tokens for auto-login
  const tokenPair = jwtManager.generateTokenPair({
    id: user._id,
    email: user.email,
    role: user.role
  });

  // Set secure HttpOnly cookies
  setAuthCookies(res, tokenPair.accessToken, tokenPair.refreshToken, user);

  logger.info('OTP verified successfully', { userId: user._id, email: user.email });

  res.json({
    success: true,
    message: 'Email verified successfully! Welcome to Bloocube!',
    data: {
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        profile: user.profile,
        isActive: user.isActive,
        isVerified: user.isVerified
      }
      // Tokens are now in HttpOnly cookies, not in response body
    }
  });
});

/**
 * Resend OTP for registration
 */
const resendOTP = asyncHandler(async (req, res) => {
  const { email } = req.body;

  if (!email) {
    return res.status(HTTP_STATUS.BAD_REQUEST).json({
      success: false,
      message: 'Email is required'
    });
  }

  const user = await User.findByEmail(email).select('+otp.code +otp.expiresAt +otp.attempts');
  if (!user) {
    return res.status(HTTP_STATUS.NOT_FOUND).json({
      success: false,
      message: 'User not found'
    });
  }

  if (user.isVerified) {
    return res.status(HTTP_STATUS.BAD_REQUEST).json({
      success: false,
      message: 'Email is already verified'
    });
  }

  // Generate new OTP
  const otpCode = user.generateOTP();
  await user.save();

  // Send OTP email
  try {
    const emailService = require('../services/notifier/email');
    await emailService.sendOTPEmail(user.email, otpCode);
    
    logger.info('OTP resent for user registration', { userId: user._id, email: user.email });
    
    res.json({
      success: true,
      message: 'Verification code sent to your email'
    });
  } catch (e) {
    logger.error('Failed to resend OTP email', e);
    res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: 'Failed to send verification code. Please try again.'
    });
  }
});

module.exports = {
  register,
  login,
  checkEmail,
  getProfile,
  updateProfile,
  requestPasswordReset,
  resetPassword,
  logout,
  deleteAccount,
  verifyEmail,
  resendVerification,
  verifyOTP,
  resendOTP
};
