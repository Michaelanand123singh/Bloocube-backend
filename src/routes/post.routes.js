const express = require('express');
const router = express.Router();
const postController = require('../controllers/postController');
const { authenticate } = require('../middlewares/auth');
const { body, query, param } = require('express-validator');
const { upload, persistUploads } = require('../middlewares/upload');
// Validation rules
const postValidation = [
  body('title')
    .isLength({ min: 1, max: 200 })
    .withMessage('Title must be between 1 and 200 characters')
    .trim(),
  body('content')
    .isLength({ min: 1, max: 10000 })
    .withMessage('Content must be between 1 and 10000 characters')
    .trim(),
  body('platform')
    .isIn(['twitter', 'youtube', 'instagram', 'linkedin', 'facebook'])
    .withMessage('Platform must be one of: twitter, youtube, instagram, linkedin, facebook'),
  body('post_type')
    .isIn(['post', 'story', 'reel', 'video', 'live', 'carousel', 'poll', 'tweet', 'thread'])
    .withMessage('Post type must be one of: post, story, reel, video, live, carousel, poll, tweet, thread'),
  body('status')
    .optional()
    .isIn(['draft', 'scheduled', 'published'])
    .withMessage('Status must be draft, scheduled, or published')
];

const paginationValidation = [
  query('page')
    .optional()
    .isInt({ min: 1 })
    .withMessage('Page must be a positive integer'),
  query('limit')
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage('Limit must be between 1 and 100')
];

const idValidation = [
  param('id')
    .isMongoId()
    .withMessage('Invalid post ID')
];

// Middleware to handle file uploads + persist to storage (GCS/local)
const uploadMiddleware = [
  upload.array('media', 10), // This is the multer function
  persistUploads             // This is your custom persistence function
];

// Routes

// Create a new post
router.post('/',
  authenticate,
  uploadMiddleware,
  postValidation,
  postController.createPost
);

// Get user's posts
router.get('/',
  authenticate,
  paginationValidation,
  postController.getUserPosts
);

// Get user's drafts
router.get('/drafts',
  authenticate,
  paginationValidation,
  postController.getDrafts
);

// Validate post content
router.post('/validate',
  authenticate,
  [
    body('content')
      .isLength({ min: 1 })
      .withMessage('Content is required')
      .trim(),
    body('platforms')
      .optional()
      .isArray()
      .withMessage('Platforms must be an array')
  ],
  postController.validateContent
);

// Get a specific post
router.get('/:id',
  authenticate,
  idValidation,
  postController.getPost
);

// Update a post
router.put('/:id',
  authenticate,
  idValidation,
  uploadMiddleware,
  postValidation,
  postController.updatePost
);

// Delete a post
router.delete('/:id',
  authenticate,
  idValidation,
  postController.deletePost
);

// Publish a post immediately
router.post('/publish',
  authenticate,
  uploadMiddleware,
  postValidation,
  postController.publishPost
);

// Schedule a post for later
router.post('/schedule',
  authenticate,
  uploadMiddleware,
  [
    ...postValidation,
    body('scheduledAt')
      .isISO8601()
      .withMessage('Valid scheduled date required')
      .custom((value) => {
        const scheduledDate = new Date(value);
        const now = new Date();
        if (scheduledDate <= now) {
          throw new Error('Scheduled date must be in the future');
        }
        return true;
      })
  ],
  postController.schedulePost
);

// Publish an existing post by ID
router.put('/:id/publish',
  authenticate,
  idValidation,
  postController.publishPostById
);

// Schedule an existing post by ID
router.put('/:id/schedule',
  authenticate,
  idValidation,
  [
    body('scheduledAt')
      .isISO8601()
      .withMessage('Valid scheduled date required')
      .custom((value) => {
        const scheduledDate = new Date(value);
        const now = new Date();
        if (scheduledDate <= now) {
          throw new Error('Scheduled date must be in the future');
        }
        return true;
      })
  ],
  postController.schedulePostById
);

// Test Twitter connection
router.get('/test-twitter-connection',
  authenticate,
  postController.testTwitterConnection
);

// Error handling middleware
router.use((error, req, res, next) => {
  console.error('❌ Post routes error:', error);
  
  if (error.code === 'LIMIT_FILE_SIZE') {
    return res.status(400).json({
      success: false,
      message: 'File too large. Maximum size is 100MB per file.'
    });
  }
  
  if (error.code === 'LIMIT_FILE_COUNT') {
    return res.status(400).json({
      success: false,
      message: 'Too many files. Maximum 10 files per post.'
    });
  }

  res.status(500).json({
    success: false,
    message: error.message || 'Internal server error'
  });
});

module.exports = router;