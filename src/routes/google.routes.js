const router = require('express').Router();
const controller = require('../controllers/googleController');
const { authenticate, optionalAuth } = require('../middlewares/auth');

// Auth URL generation should NOT require authentication - it's used to initiate login
router.post('/auth-url', optionalAuth, controller.generateAuthURL);
router.get('/auth-url', optionalAuth, controller.generateAuthURL);
router.get('/callback', controller.handleCallback);

module.exports = router;


