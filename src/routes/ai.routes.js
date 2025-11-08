// src/routes/ai.routes.js
const router = require('express').Router();
const { authenticate } = require('../middlewares/auth');
const { aiServiceLimiter } = require('../middlewares/rateLimiter');
const ctrl = require('../controllers/aiController');

router.post('/competitor-analysis', authenticate, aiServiceLimiter, ctrl.competitorAnalysis);
router.post('/suggestions', authenticate, aiServiceLimiter, ctrl.suggestions);
router.post('/matchmaking', authenticate, aiServiceLimiter, ctrl.matchmaking);
router.post('/score', authenticate, aiServiceLimiter, ctrl.scoreContent);

module.exports = router;


