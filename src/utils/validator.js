// src/utils/validator.js
const Joi = require('joi');
const { body, param, query, validationResult } = require('express-validator');
const logger = require('./logger');

// Common validation schemas
const commonSchemas = {
  objectId: Joi.string().pattern(/^[0-9a-fA-F]{24}$/).required(),
  email: Joi.string().email().lowercase().trim().required(),
  password: Joi.string().min(6).max(128).required(),
  name: Joi.string().min(2).max(100).trim().required(),
  phone: Joi.string().pattern(/^[\+]?[1-9][\d]{0,15}$/).optional(),
  url: Joi.string().uri().optional(),
  date: Joi.date().iso().optional(),
  positiveNumber: Joi.number().positive().optional(),
  nonNegativeNumber: Joi.number().min(0).optional()
};

// User validation schemas
const userValidation = {
  register: Joi.object({
    name: commonSchemas.name,
    email: commonSchemas.email,
    password: commonSchemas.password,
    role: Joi.string().valid('creator', 'brand', 'admin').default('creator'),
    profile: Joi.object({
      bio: Joi.string().max(500).optional(),
      avatar_url: Joi.string().uri().optional(),
      social_links: Joi.object({
        youtube: Joi.string().uri().optional(),
        instagram: Joi.string().uri().optional(),
        twitter: Joi.string().uri().optional(),
        linkedin: Joi.string().uri().optional(),
        facebook: Joi.string().uri().optional()
      }).optional()
    }).optional()
  }),

  login: Joi.object({
    email: commonSchemas.email,
    password: Joi.string().required()
  }),

  updateProfile: Joi.object({
    name: commonSchemas.name.optional(),
    email: commonSchemas.email.optional(),
    profile: Joi.object({
      bio: Joi.string().max(500).optional(),
      avatar_url: Joi.string().uri().optional(),
      phone: commonSchemas.phone.optional(),
      location: Joi.string().max(100).optional(),
      website: Joi.string().uri().optional(),
      dateOfBirth: Joi.date().max('now').optional(),
      gender: Joi.string().valid('male', 'female', 'other', 'prefer_not_to_say').optional(),
      language: Joi.string().length(2).optional(),
      timezone: Joi.string().optional(),
      social_links: Joi.object({
        youtube: Joi.string().uri().optional(),
        instagram: Joi.string().uri().optional(),
        twitter: Joi.string().uri().optional(),
        linkedin: Joi.string().uri().optional(),
        facebook: Joi.string().uri().optional(),
        tiktok: Joi.string().uri().optional(),
        snapchat: Joi.string().uri().optional(),
        website: Joi.string().uri().optional()
      }).optional(),
      preferences: Joi.object({
        emailNotifications: Joi.boolean().optional(),
        pushNotifications: Joi.boolean().optional(),
        smsNotifications: Joi.boolean().optional(),
        marketingEmails: Joi.boolean().optional(),
        profileVisibility: Joi.string().valid('public', 'private', 'followers_only').optional()
      }).optional()
    }).optional()
  }).min(1),

  changePassword: Joi.object({
    currentPassword: Joi.string().required(),
    newPassword: commonSchemas.password
  }),

  deleteAccount: Joi.object({
    password: Joi.string().required()
  }),

  // Admin password change (no current password required)
  adminChangePassword: Joi.object({
    newPassword: commonSchemas.password
  })
};

// Campaign validation schemas
const campaignValidation = {
  create: Joi.object({
    title: Joi.string().min(5).max(200).trim().required(),
    description: Joi.string().min(10).max(2000).trim().required(),
    budget: Joi.number().min(1000).max(10000000).required(),
    deadline: Joi.date().greater('now').required(),
    requirements: Joi.object({
      platforms: Joi.array().items(
        Joi.string().valid('instagram', 'youtube', 'twitter', 'linkedin', 'facebook')
      ).min(1).required(),
      minFollowers: Joi.number().min(0).optional(),
      maxFollowers: Joi.number().min(0).optional(),
      contentTypes: Joi.array().items(
        Joi.string().valid('post', 'story', 'reel', 'video', 'live', 'carousel')
      ).optional(),
      hashtags: Joi.array().items(Joi.string()).optional(),
      mentions: Joi.array().items(Joi.string()).optional()
    }).required(),
    deliverables: Joi.object({
      posts: Joi.number().min(1).default(1),
      stories: Joi.number().min(0).default(0),
      reels: Joi.number().min(0).default(0),
      videos: Joi.number().min(0).default(0)
    }).optional(),
    payment: Joi.object({
      type: Joi.string().valid('fixed', 'performance').default('fixed'),
      amount: Joi.number().min(0).required(),
      currency: Joi.string().valid('INR', 'USD', 'EUR').default('INR')
    }).required(),
    tags: Joi.array().items(Joi.string()).optional(),
    isPublic: Joi.boolean().default(true),
    maxApplications: Joi.number().min(1).max(1000).default(50),
    applicationDeadline: Joi.date().optional()
  }),

  update: Joi.object({
    title: Joi.string().min(5).max(200).trim().optional(),
    description: Joi.string().min(10).max(2000).trim().optional(),
    budget: Joi.number().min(1000).max(10000000).optional(),
    deadline: Joi.date().greater('now').optional(),
    status: Joi.string().valid('draft', 'active', 'closed', 'completed', 'cancelled').optional(),
    requirements: Joi.object({
      platforms: Joi.array().items(
        Joi.string().valid('instagram', 'youtube', 'twitter', 'linkedin', 'facebook')
      ).min(1).optional(),
      minFollowers: Joi.number().min(0).optional(),
      maxFollowers: Joi.number().min(0).optional(),
      contentTypes: Joi.array().items(
        Joi.string().valid('post', 'story', 'reel', 'video', 'live', 'carousel')
      ).optional(),
      hashtags: Joi.array().items(Joi.string()).optional(),
      mentions: Joi.array().items(Joi.string()).optional()
    }).optional(),
    deliverables: Joi.object({
      posts: Joi.number().min(1).optional(),
      stories: Joi.number().min(0).optional(),
      reels: Joi.number().min(0).optional(),
      videos: Joi.number().min(0).optional()
    }).optional(),
    payment: Joi.object({
      type: Joi.string().valid('fixed', 'performance').optional(),
      amount: Joi.number().min(0).optional(),
      currency: Joi.string().valid('INR', 'USD', 'EUR').optional()
    }).optional(),
    tags: Joi.array().items(Joi.string()).optional(),
    isPublic: Joi.boolean().optional(),
    maxApplications: Joi.number().min(1).max(1000).optional(),
    applicationDeadline: Joi.date().optional()
  }).min(1)
};

// Bid validation schemas
const bidValidation = {
  create: Joi.object({
    campaign_id: commonSchemas.objectId,
    proposal_text: Joi.string().min(10).max(2000).trim().required(),
    bid_amount: Joi.number().min(0).required(),
    currency: Joi.string().valid('INR', 'USD', 'EUR').default('INR'),
    deliverables: Joi.object({
      posts: Joi.number().min(0).default(1),
      stories: Joi.number().min(0).default(0),
      reels: Joi.number().min(0).default(0),
      videos: Joi.number().min(0).default(0),
      timeline: Joi.string().max(500).optional()
    }).optional(),
    portfolio_links: Joi.array().items(
      Joi.object({
        platform: Joi.string().valid('instagram', 'youtube', 'twitter', 'linkedin', 'facebook').required(),
        url: Joi.string().uri().required(),
        description: Joi.string().max(200).optional()
      })
    ).optional(),
    previous_work: Joi.array().items(
      Joi.object({
        title: Joi.string().max(100).required(),
        description: Joi.string().max(500).optional(),
        url: Joi.string().uri().optional(),
        metrics: Joi.object({
          views: Joi.number().min(0).optional(),
          likes: Joi.number().min(0).optional(),
          comments: Joi.number().min(0).optional(),
          shares: Joi.number().min(0).optional()
        }).optional()
      })
    ).optional(),
    terms: Joi.object({
      revision_rounds: Joi.number().min(0).max(5).default(2),
      payment_schedule: Joi.string().valid('upfront', 'milestone', 'completion').default('completion'),
      additional_requirements: Joi.string().max(500).optional()
    }).optional(),
    communication: Joi.object({
      preferred_method: Joi.string().valid('email', 'phone', 'whatsapp', 'telegram').default('email'),
      contact_info: Joi.string().max(200).optional(),
      availability: Joi.string().max(200).optional()
    }).optional()
  }),

  update: Joi.object({
    proposal_text: Joi.string().min(10).max(2000).trim().optional(),
    bid_amount: Joi.number().min(0).optional(),
    status: Joi.string().valid('pending', 'accepted', 'rejected', 'withdrawn', 'completed').optional(),
    deliverables: Joi.object({
      posts: Joi.number().min(0).optional(),
      stories: Joi.number().min(0).optional(),
      reels: Joi.number().min(0).optional(),
      videos: Joi.number().min(0).optional(),
      timeline: Joi.string().max(500).optional()
    }).optional()
  }).min(1)
};

// Analytics validation schemas
const analyticsValidation = {
  create: Joi.object({
    user_id: commonSchemas.objectId,
    campaign_id: commonSchemas.objectId.optional(),
    platform: Joi.string().valid('youtube', 'instagram', 'twitter', 'linkedin', 'facebook').required(),
    post_id: Joi.string().required(),
    post_type: Joi.string().valid('post', 'story', 'reel', 'video', 'live', 'carousel', 'poll').required(),
    content: Joi.object({
      caption: Joi.string().optional(),
      hashtags: Joi.array().items(Joi.string()).optional(),
      mentions: Joi.array().items(Joi.string()).optional(),
      media_type: Joi.string().valid('image', 'video', 'carousel', 'text').optional(),
      media_count: Joi.number().min(1).default(1)
    }).optional(),
    metrics: Joi.object({
      followers: Joi.number().min(0).default(0),
      likes: Joi.number().min(0).default(0),
      comments: Joi.number().min(0).default(0),
      shares: Joi.number().min(0).default(0),
      saves: Joi.number().min(0).default(0),
      views: Joi.number().min(0).default(0),
      reach: Joi.number().min(0).default(0),
      impressions: Joi.number().min(0).default(0),
      clicks: Joi.number().min(0).default(0)
    }).optional(),
    timing: Joi.object({
      posted_at: Joi.date().required(),
      best_performing_hour: Joi.number().min(0).max(23).optional(),
      best_performing_day: Joi.string().optional(),
      peak_engagement_time: Joi.date().optional()
    }).required()
  })
};

// Express validation middleware
const validateRequest = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    logger.warn('Validation errors', { errors: errors.array() });
    return res.status(400).json({
      success: false,
      message: 'Validation failed',
      errors: errors.array()
    });
  }
  next();
};

// Joi validation middleware
const validateWithJoi = (schema, property = 'body') => {
  return (req, res, next) => {
    const { error, value } = schema.validate(req[property], { 
      abortEarly: false,
      stripUnknown: true 
    });
    
    if (error) {
      logger.warn('Joi validation errors', { errors: error.details });
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: error.details.map(detail => ({
          field: detail.path.join('.'),
          message: detail.message
        }))
      });
    }
    
    req[property] = value;
    next();
  };
};

// Express-validator rules
const validationRules = {
  // User validation rules
  userRegister: [
    body('name').trim().isLength({ min: 2, max: 100 }).withMessage('Name must be 2-100 characters'),
    body('email').isEmail().normalizeEmail().withMessage('Valid email required'),
    body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters'),
    body('role').optional().isIn(['creator', 'brand', 'admin']).withMessage('Invalid role')
  ],

  userLogin: [
    body('email').isEmail().normalizeEmail().withMessage('Valid email required'),
    body('password').notEmpty().withMessage('Password is required')
  ],

  // Campaign validation rules
  campaignCreate: [
    body('title').trim().isLength({ min: 5, max: 200 }).withMessage('Title must be 5-200 characters'),
    body('description').trim().isLength({ min: 10, max: 2000 }).withMessage('Description must be 10-2000 characters'),
    body('budget').isFloat({ min: 1000, max: 10000000 }).withMessage('Budget must be between 1000-10000000'),
    body('deadline').isISO8601().withMessage('Valid deadline required'),
    body('requirements.platforms').isArray({ min: 1 }).withMessage('At least one platform required')
  ],

  // Bid validation rules
  bidCreate: [
    body('campaign_id').isMongoId().withMessage('Valid campaign ID required'),
    body('proposal_text').trim().isLength({ min: 10, max: 2000 }).withMessage('Proposal must be 10-2000 characters'),
    body('bid_amount').isFloat({ min: 0 }).withMessage('Bid amount must be non-negative')
  ],

  // Parameter validation rules
  objectId: [
    param('id').isMongoId().withMessage('Valid ID required')
  ],

  // Query validation rules
  pagination: [
    query('page').optional().isInt({ min: 1 }).withMessage('Page must be positive integer'),
    query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Limit must be 1-100'),
    query('sort').optional().isIn(['createdAt', '-createdAt', 'updatedAt', '-updatedAt']).withMessage('Invalid sort field')
  ]
};

module.exports = {
  commonSchemas,
  userValidation,
  campaignValidation,
  bidValidation,
  analyticsValidation,
  validateRequest,
  validateWithJoi,
  validationRules
};
