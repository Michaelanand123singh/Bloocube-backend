1// src/routes/profile.routes.js
const router = require('express').Router();
const { authenticate } = require('../middlewares/auth');
const { validateWithJoi, userValidation } = require('../utils/validator');
const { upload } = require('../middlewares/upload');
const profileController = require('../controllers/profileController');

// Profile routes
router.get('/me', authenticate, profileController.getProfile);
router.put('/me', authenticate, validateWithJoi(userValidation.updateProfile), profileController.updateProfile);
router.get('/stats', authenticate, profileController.getUserStats);

// Password management
router.post('/change-password', authenticate, validateWithJoi(userValidation.changePassword), profileController.changePassword);

// Avatar management
router.post('/avatar', authenticate, upload.single('avatar'), profileController.uploadAvatar);

// Account management
router.delete('/account', authenticate, validateWithJoi(userValidation.deleteAccount), profileController.deleteAccount);

module.exports = router;
