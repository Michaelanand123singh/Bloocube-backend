const express = require('express');
const router = express.Router();
const facebookController = require('../controllers/facebookController');
const { authenticate, optionalAuth } = require('../middlewares/auth');

// Facebook OAuth routes
router.post('/auth-url', optionalAuth, facebookController.generateAuthURL);
router.get('/callback', facebookController.handleCallback);

// Facebook profile and connection management
router.get('/profile', authenticate, facebookController.getProfile);
router.get('/status', authenticate, facebookController.getStatus);
router.post('/disconnect', authenticate, facebookController.disconnect);
router.get('/validate', authenticate, facebookController.validateConnection);
router.get('/pages', authenticate, facebookController.getPages);
router.post('/default-page', authenticate, facebookController.setDefaultPage);

// Facebook content posting is handled by the main postController
// router.post('/post', authenticate, facebookController.postContent);

module.exports = router;
