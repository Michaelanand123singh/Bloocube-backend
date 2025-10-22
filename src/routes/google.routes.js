const router = require('express').Router();
const controller = require('../controllers/googleController');
const { authenticate } = require('../middlewares/auth');

router.post('/auth-url', authenticate, controller.generateAuthURL);
router.get('/auth-url', authenticate, controller.generateAuthURL);
router.get('/callback', controller.handleCallback);

module.exports = router;


