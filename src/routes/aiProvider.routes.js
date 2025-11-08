// src/routes/aiProvider.routes.js
const router = require('express').Router();
const { authenticate, authorize } = require('../middlewares/auth');
const ctrl = require('../controllers/aiProviderController');

// Protect all AI provider management routes - Super Admin only
// Rate limiting is disabled for admin routes (handled globally in dynamicLimiter)
router.use(authenticate, authorize('admin'));

// AI Provider Status and Management
router.get('/status', ctrl.getProvidersStatus);
router.post('/switch', ctrl.switchPrimaryProvider);
router.post('/test', ctrl.testProvider);

// Model Management
router.get('/models', ctrl.getAvailableModels);

// Health and Monitoring
router.get('/health', ctrl.healthCheckProviders);
router.get('/usage-stats', ctrl.getUsageStatistics);
router.get('/logs', ctrl.getProviderLogs);

// Configuration Management
router.put('/config', ctrl.updateProviderConfig);

module.exports = router;
