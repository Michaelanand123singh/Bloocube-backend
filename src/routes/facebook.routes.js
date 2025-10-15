const express = require('express');
const router = express.Router();
const facebookController = require('../controllers/facebookController');
const { authenticate } = require('../middlewares/auth');

// Facebook OAuth routes
router.post('/auth-url', authenticate, facebookController.generateAuthURL);
router.get('/callback', facebookController.handleCallback);

// Facebook profile and connection management
router.get('/profile', authenticate, facebookController.getProfile);
router.post('/disconnect', authenticate, facebookController.disconnect);
router.get('/validate', authenticate, facebookController.validateConnection);

module.exports = router;
