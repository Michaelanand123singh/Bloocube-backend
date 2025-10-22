// src/utils/postValidation.js
const logger = require('./logger');

/**
 * Platform-specific content validation rules
 */
const PLATFORM_VALIDATORS = {
  twitter: {
    maxLength: 280,
    minLength: 1,
    allowedMediaTypes: ['image', 'video'],
    maxMediaFiles: 4,
    maxVideoSize: 512 * 1024 * 1024, // 512MB
    maxImageSize: 5 * 1024 * 1024, // 5MB
    supportedVideoFormats: ['mp4', 'mov'],
    supportedImageFormats: ['jpg', 'jpeg', 'png', 'gif', 'webp']
  },
  linkedin: {
    maxLength: 3000,
    minLength: 1,
    allowedMediaTypes: ['image', 'video'],
    maxMediaFiles: 1,
    maxVideoSize: 200 * 1024 * 1024, // 200MB
    maxImageSize: 5 * 1024 * 1024, // 5MB
    supportedVideoFormats: ['mp4'],
    supportedImageFormats: ['jpg', 'jpeg', 'png']
  },
  instagram: {
    maxLength: 2200,
    minLength: 1,
    allowedMediaTypes: ['image', 'video'],
    maxMediaFiles: 10, // For carousel posts
    maxVideoSize: 100 * 1024 * 1024, // 100MB
    maxImageSize: 8 * 1024 * 1024, // 8MB
    supportedVideoFormats: ['mp4', 'mov'],
    supportedImageFormats: ['jpg', 'jpeg', 'png']
  },
  youtube: {
    maxLength: 5000, // Description
    minLength: 1,
    allowedMediaTypes: ['video'],
    maxMediaFiles: 1,
    maxVideoSize: 128 * 1024 * 1024 * 1024, // 128GB
    maxImageSize: 0, // No images for YouTube
    supportedVideoFormats: ['mp4', 'mov', 'avi', 'wmv', 'flv', 'webm'],
    supportedImageFormats: []
  },
  facebook: {
    maxLength: 63206,
    minLength: 1,
    allowedMediaTypes: ['image', 'video'],
    maxMediaFiles: 10,
    maxVideoSize: 4 * 1024 * 1024 * 1024, // 4GB
    maxImageSize: 10 * 1024 * 1024, // 10MB
    supportedVideoFormats: ['mp4', 'mov', 'avi', 'wmv'],
    supportedImageFormats: ['jpg', 'jpeg', 'png', 'gif', 'webp']
  }
};

/**
 * Validate post content for a specific platform
 * @param {Object} post - Post object containing content and media
 * @param {string} platform - Target platform
 * @returns {Object} Validation result
 */
function validatePostContent(post, platform) {
  const validator = PLATFORM_VALIDATORS[platform];
  if (!validator) {
    return {
      isValid: false,
      errors: [`Unsupported platform: ${platform}`],
      warnings: []
    };
  }

  const errors = [];
  const warnings = [];
  const content = post.content?.caption || post.title || '';

  // Content length validation
  if (content.length < validator.minLength) {
    errors.push(`Content must be at least ${validator.minLength} characters long`);
  }
  
  if (content.length > validator.maxLength) {
    errors.push(`Content exceeds ${platform} limit of ${validator.maxLength} characters`);
  }

  // Media validation
  if (post.media && post.media.length > 0) {
    // Check media count
    if (post.media.length > validator.maxMediaFiles) {
      errors.push(`Too many media files. Maximum ${validator.maxMediaFiles} allowed for ${platform}`);
    }

    // Validate each media file
    post.media.forEach((media, index) => {
      const mediaType = media.type;
      
      // Check if media type is allowed
      if (!validator.allowedMediaTypes.includes(mediaType)) {
        errors.push(`Media type '${mediaType}' not supported for ${platform}`);
        return;
      }

      // Check file size
      const maxSize = mediaType === 'video' ? validator.maxVideoSize : validator.maxImageSize;
      if (media.size > maxSize) {
        const sizeMB = Math.round(maxSize / (1024 * 1024));
        errors.push(`Media file ${index + 1} exceeds ${platform} size limit of ${sizeMB}MB`);
      }

      // Check file format
      const filename = media.filename || '';
      const extension = filename.split('.').pop()?.toLowerCase();
      const supportedFormats = mediaType === 'video' ? validator.supportedVideoFormats : validator.supportedImageFormats;
      
      if (extension && !supportedFormats.includes(extension)) {
        errors.push(`Media file ${index + 1} format '${extension}' not supported for ${platform}`);
      }
    });
  }

  // Platform-specific warnings
  if (platform === 'twitter' && content.length > 250) {
    warnings.push('Twitter content is close to character limit');
  }
  
  if (platform === 'linkedin' && content.length > 2500) {
    warnings.push('LinkedIn content is very long and may be truncated');
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings
  };
}

/**
 * Validate post data before processing
 * @param {Object} postData - Post data from request
 * @returns {Object} Validation result
 */
function validatePostData(postData) {
  const errors = [];
  const warnings = [];

  // Required fields
  if (!postData.platform) {
    errors.push('Platform is required');
  }

  if (!postData.post_type) {
    errors.push('Post type is required');
  }

  if (!postData.content && !postData.title) {
    errors.push('Content or title is required');
  }

  // Platform-specific validation
  if (postData.platform && PLATFORM_VALIDATORS[postData.platform]) {
    const platformValidation = validatePostContent(postData, postData.platform);
    errors.push(...platformValidation.errors);
    warnings.push(...platformValidation.warnings);
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings
  };
}

/**
 * Sanitize post content
 * @param {string} content - Raw content
 * @param {string} platform - Target platform
 * @returns {string} Sanitized content
 */
function sanitizeContent(content, platform) {
  if (!content) return '';

  let sanitized = content.trim();

  // Remove excessive whitespace
  sanitized = sanitized.replace(/\s+/g, ' ');

  // Platform-specific sanitization
  switch (platform) {
    case 'twitter':
      // Remove excessive hashtags (keep max 2)
      const hashtags = sanitized.match(/#\w+/g) || [];
      if (hashtags.length > 2) {
        warnings.push('Too many hashtags for Twitter, consider reducing');
      }
      break;
    
    case 'linkedin':
      // Remove excessive line breaks
      sanitized = sanitized.replace(/\n{3,}/g, '\n\n');
      break;
  }

  return sanitized;
}

/**
 * Get platform-specific recommendations
 * @param {Object} postData - Post data
 * @param {string} platform - Target platform
 * @returns {Array} Array of recommendations
 */
function getRecommendations(postData, platform) {
  const recommendations = [];
  const content = postData.content?.caption || postData.title || '';

  switch (platform) {
    case 'twitter':
      if (content.length < 50) {
        recommendations.push('Consider adding more context to your tweet');
      }
      if (!content.includes('#') && !content.includes('@')) {
        recommendations.push('Consider adding hashtags or mentions to increase engagement');
      }
      break;

    case 'linkedin':
      if (content.length < 100) {
        recommendations.push('LinkedIn posts perform better with longer, more detailed content');
      }
      if (!content.includes('?')) {
        recommendations.push('Consider asking a question to encourage engagement');
      }
      break;

    case 'instagram':
      if (!postData.media || postData.media.length === 0) {
        recommendations.push('Instagram posts perform better with visual content');
      }
      if (content.length < 50) {
        recommendations.push('Consider adding a detailed caption');
      }
      break;

    case 'youtube':
      if (content.length < 200) {
        recommendations.push('YouTube descriptions should be detailed for better SEO');
      }
      if (!content.includes('#')) {
        recommendations.push('Consider adding hashtags to improve discoverability');
      }
      break;
  }

  return recommendations;
}

module.exports = {
  validatePostContent,
  validatePostData,
  sanitizeContent,
  getRecommendations,
  PLATFORM_VALIDATORS
};
