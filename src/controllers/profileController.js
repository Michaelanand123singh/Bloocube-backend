// src/controllers/profileController.js
const User = require('../models/User');
const { HTTP_STATUS, SUCCESS_MESSAGES, ERROR_MESSAGES } = require('../utils/constants');
const { asyncHandler } = require('../middlewares/errorHandler');
const logger = require('../utils/logger');
const bcrypt = require('bcryptjs');

/**
 * Get current user profile
 */
const getProfile = asyncHandler(async (req, res) => {
  const userId = req.userId;
  
  const user = await User.findById(userId).select('-password -refreshTokens');
  
  if (!user) {
    return res.status(HTTP_STATUS.NOT_FOUND).json({
      success: false,
      message: ERROR_MESSAGES.USER_NOT_FOUND
    });
  }

  res.json({
    success: true,
    data: { user }
  });
});

/**
 * Update user profile
 */
const updateProfile = asyncHandler(async (req, res) => {
  const userId = req.userId;
  const updateData = req.body;

  const user = await User.findById(userId);
  if (!user) {
    return res.status(HTTP_STATUS.NOT_FOUND).json({
      success: false,
      message: ERROR_MESSAGES.USER_NOT_FOUND
    });
  }

  // Update basic fields
  if (updateData.name !== undefined) user.name = updateData.name;
  if (updateData.email !== undefined) {
    // Check if email is already taken by another user
    const existingUser = await User.findOne({ 
      email: updateData.email.toLowerCase(), 
      _id: { $ne: userId } 
    });
    if (existingUser) {
      return res.status(HTTP_STATUS.CONFLICT).json({
        success: false,
        message: 'Email is already taken by another user'
      });
    }
    user.email = updateData.email.toLowerCase();
  }

  // Update profile fields
  if (updateData.profile) {
    const profile = updateData.profile;
    
    // Basic profile info
    // Convert empty strings to null/undefined for optional fields
    if (profile.bio !== undefined) user.profile.bio = profile.bio === '' ? null : profile.bio;
    if (profile.avatar_url !== undefined) user.profile.avatar_url = profile.avatar_url === '' ? null : profile.avatar_url;
    if (profile.phone !== undefined) user.profile.phone = profile.phone === '' ? null : profile.phone;
    if (profile.location !== undefined) user.profile.location = profile.location === '' ? null : profile.location;
    if (profile.website !== undefined) user.profile.website = profile.website === '' ? null : profile.website;
    if (profile.dateOfBirth !== undefined) user.profile.dateOfBirth = profile.dateOfBirth === '' || profile.dateOfBirth === null ? null : profile.dateOfBirth;
    if (profile.gender !== undefined) user.profile.gender = profile.gender === '' || profile.gender === null ? null : profile.gender;
    if (profile.language !== undefined) user.profile.language = profile.language === '' ? null : profile.language;
    if (profile.timezone !== undefined) user.profile.timezone = profile.timezone === '' ? null : profile.timezone;

    // Social links
    if (profile.social_links) {
      Object.keys(profile.social_links).forEach(platform => {
        if (user.profile.social_links[platform] !== undefined) {
          user.profile.social_links[platform] = profile.social_links[platform];
        }
      });
    }

    // Preferences
    if (profile.preferences) {
      const preferences = profile.preferences;
      if (preferences.emailNotifications !== undefined) {
        user.profile.preferences.emailNotifications = preferences.emailNotifications;
      }
      if (preferences.pushNotifications !== undefined) {
        user.profile.preferences.pushNotifications = preferences.pushNotifications;
      }
      if (preferences.smsNotifications !== undefined) {
        user.profile.preferences.smsNotifications = preferences.smsNotifications;
      }
      if (preferences.marketingEmails !== undefined) {
        user.profile.preferences.marketingEmails = preferences.marketingEmails;
      }
      if (preferences.profileVisibility !== undefined) {
        user.profile.preferences.profileVisibility = preferences.profileVisibility;
      }
    }
  }

  await user.save();

  logger.info('User profile updated', { 
    userId, 
    updatedFields: Object.keys(updateData) 
  });

  // Return updated user without sensitive data
  const updatedUser = await User.findById(userId).select('-password -refreshTokens');

  res.json({
    success: true,
    message: SUCCESS_MESSAGES.USER_UPDATED,
    data: { user: updatedUser }
  });
});

/**
 * Change password
 */
const changePassword = asyncHandler(async (req, res) => {
  const userId = req.userId;
  const { currentPassword, newPassword } = req.body;

  if (!currentPassword || !newPassword) {
    return res.status(HTTP_STATUS.BAD_REQUEST).json({
      success: false,
      message: 'Current password and new password are required'
    });
  }

  if (newPassword.length < 6) {
    return res.status(HTTP_STATUS.BAD_REQUEST).json({
      success: false,
      message: 'New password must be at least 6 characters long'
    });
  }

  const user = await User.findById(userId).select('+password');
  if (!user) {
    return res.status(HTTP_STATUS.NOT_FOUND).json({
      success: false,
      message: ERROR_MESSAGES.USER_NOT_FOUND
    });
  }

  // Verify current password
  const isCurrentPasswordValid = await user.comparePassword(currentPassword);
  if (!isCurrentPasswordValid) {
    return res.status(HTTP_STATUS.UNAUTHORIZED).json({
      success: false,
      message: 'Current password is incorrect'
    });
  }

  // Update password (the pre-save middleware will handle hashing)
  user.password = newPassword;
  await user.save();

  // Clear all authentication cookies after password change for security
  const { clearAuthCookies } = require('../utils/cookies');
  clearAuthCookies(res);

  logger.info('User password changed', { userId });

  res.json({
    success: true,
    message: 'Password changed successfully. Please log in again with your new password.'
  });
});

/**
 * Upload avatar
 */
const uploadAvatar = asyncHandler(async (req, res) => {
  const userId = req.userId;
  
  if (!req.file) {
    return res.status(HTTP_STATUS.BAD_REQUEST).json({
      success: false,
      message: 'No file uploaded'
    });
  }

  const user = await User.findById(userId);
  if (!user) {
    return res.status(HTTP_STATUS.NOT_FOUND).json({
      success: false,
      message: ERROR_MESSAGES.USER_NOT_FOUND
    });
  }

  // Validate file type (only images)
  if (!req.file.mimetype.startsWith('image/')) {
    return res.status(HTTP_STATUS.BAD_REQUEST).json({
      success: false,
      message: 'Only image files are allowed for avatar'
    });
  }

  // Process file upload
  const { isGcsEnabled, uploadBufferToGcs } = require('../utils/storage');
  const path = require('path');
  const fs = require('fs');
  const crypto = require('crypto');
  const config = require('../config/env');

  let avatarUrl;

  try {
    const originalExt = path.extname(req.file.originalname).toLowerCase();
    const hashedName = crypto.randomBytes(16).toString('hex') + originalExt;

    if (isGcsEnabled()) {
      // Upload to Google Cloud Storage
      const today = new Date();
      const datePrefix = `${today.getFullYear()}/${(today.getMonth() + 1).toString().padStart(2, '0')}/${today.getDate().toString().padStart(2, '0')}`;
      const gcsKey = `avatars/${datePrefix}/${hashedName}`;
      const { url } = await uploadBufferToGcs(req.file.buffer, gcsKey, req.file.mimetype);
      avatarUrl = url;
    } else {
      // Save to local storage
      const uploadDir = path.resolve('./uploads/avatars');
      if (!fs.existsSync(uploadDir)) {
        fs.mkdirSync(uploadDir, { recursive: true });
      }
      const destPath = path.join(uploadDir, hashedName);
      fs.writeFileSync(destPath, req.file.buffer);
      
      // Construct URL - use backend base URL if available, otherwise relative path
      // For relative paths, frontend will prepend the API base URL
      // Check for BASE_URL first, then PORT to construct backend URL
      let backendBaseUrl = process.env.BASE_URL || '';
      if (!backendBaseUrl) {
        const port = config.PORT || process.env.PORT || 5000;
        if (process.env.NODE_ENV === 'production') {
          backendBaseUrl = 'https://api-backend.bloocube.com';
        } else {
          backendBaseUrl = `http://localhost:${port}`;
        }
      }
      avatarUrl = `${backendBaseUrl}/uploads/avatars/${hashedName}`;
    }

    // Update user avatar
    user.profile.avatar_url = avatarUrl;
    await user.save();

    logger.info('User avatar uploaded', { userId, avatarUrl });

    res.json({
      success: true,
      message: 'Avatar uploaded successfully',
      data: { avatar_url: avatarUrl }
    });
  } catch (error) {
    logger.error('Avatar upload error', { userId, error: error.message });
    return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: 'Failed to upload avatar: ' + error.message
    });
  }
});

/**
 * Remove avatar
 */
const removeAvatar = asyncHandler(async (req, res) => {
  const userId = req.userId;

  const user = await User.findById(userId);
  if (!user) {
    return res.status(HTTP_STATUS.NOT_FOUND).json({
      success: false,
      message: ERROR_MESSAGES.USER_NOT_FOUND
    });
  }

  // If user has an avatar, optionally delete the file (for local storage)
  // For GCS, files can be left or deleted based on your cleanup strategy
  if (user.profile.avatar_url) {
    const path = require('path');
    const fs = require('fs');
    
    // Only delete local files (not GCS URLs)
    if (user.profile.avatar_url.includes('/uploads/avatars/')) {
      try {
        const filename = path.basename(user.profile.avatar_url);
        const filePath = path.resolve('./uploads/avatars', filename);
        if (fs.existsSync(filePath)) {
          fs.unlinkSync(filePath);
          logger.info('Avatar file deleted', { userId, filePath });
        }
      } catch (error) {
        // Log but don't fail if file deletion fails
        logger.warn('Failed to delete avatar file', { userId, error: error.message });
      }
    }
  }

  // Remove avatar URL from user profile
  user.profile.avatar_url = '';
  await user.save();

  logger.info('User avatar removed', { userId });

  res.json({
    success: true,
    message: 'Avatar removed successfully',
    data: { avatar_url: '' }
  });
});

/**
 * Delete account
 */
const deleteAccount = asyncHandler(async (req, res) => {
  const userId = req.userId;
  const { password } = req.body;

  if (!password) {
    return res.status(HTTP_STATUS.BAD_REQUEST).json({
      success: false,
      message: 'Password is required to delete account'
    });
  }

  const user = await User.findById(userId).select('+password');
  if (!user) {
    return res.status(HTTP_STATUS.NOT_FOUND).json({
      success: false,
      message: ERROR_MESSAGES.USER_NOT_FOUND
    });
  }

  // Verify password
  const isPasswordValid = await bcrypt.compare(password, user.password);
  if (!isPasswordValid) {
    return res.status(HTTP_STATUS.UNAUTHORIZED).json({
      success: false,
      message: 'Password is incorrect'
    });
  }

  // Soft delete - mark as inactive instead of actually deleting
  user.isActive = false;
  user.email = `deleted_${Date.now()}_${user.email}`;
  await user.save();

  logger.info('User account deleted', { userId });

  res.json({
    success: true,
    message: 'Account deleted successfully'
  });
});

/**
 * Get user statistics
 */
const getUserStats = asyncHandler(async (req, res) => {
  const userId = req.userId;

  const user = await User.findById(userId);
  if (!user) {
    return res.status(HTTP_STATUS.NOT_FOUND).json({
      success: false,
      message: ERROR_MESSAGES.USER_NOT_FOUND
    });
  }

  // Count connected social accounts
  const connectedAccounts = Object.keys(user.socialAccounts || {}).filter(
    platform => user.socialAccounts[platform] && user.socialAccounts[platform].id
  ).length;

  const stats = {
    connectedAccounts,
    accountAge: Math.floor((Date.now() - user.createdAt.getTime()) / (1000 * 60 * 60 * 24)),
    isVerified: user.isVerified,
    lastLogin: user.lastLogin,
    profileCompleteness: calculateProfileCompleteness(user)
  };

  res.json({
    success: true,
    data: { stats }
  });
});

/**
 * Calculate profile completeness percentage
 */
const calculateProfileCompleteness = (user) => {
  const fields = [
    'name',
    'email',
    'profile.bio',
    'profile.avatar_url',
    'profile.phone',
    'profile.location',
    'profile.website'
  ];

  let completedFields = 0;
  
  fields.forEach(field => {
    const value = field.split('.').reduce((obj, key) => obj?.[key], user);
    if (value && value.toString().trim() !== '') {
      completedFields++;
    }
  });

  return Math.round((completedFields / fields.length) * 100);
};

module.exports = {
  getProfile,
  updateProfile,
  changePassword,
  uploadAvatar,
  removeAvatar,
  deleteAccount,
  getUserStats
};
