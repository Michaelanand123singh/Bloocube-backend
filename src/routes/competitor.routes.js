// src/routes/competitor.routes.js
const router = require('express').Router();
const { authenticate } = require('../middlewares/auth');
const { aiServiceLimiter } = require('../middlewares/rateLimiter');
const competitorController = require('../controllers/competitorController');

// Competitor Analysis Routes
router.post('/fetch', authenticate, competitorController.fetchCompetitorData);
router.post('/analyze', authenticate, aiServiceLimiter, competitorController.analyzeCompetitors);
router.get('/analysis/:analysisId', authenticate, competitorController.getAnalysisResults);
router.get('/history', authenticate, competitorController.getAnalysisHistory);
router.delete('/analysis/:analysisId', authenticate, competitorController.deleteAnalysis);

// AI Services Test Route
router.get('/test-ai', authenticate, competitorController.testAIServices);

module.exports = router;
