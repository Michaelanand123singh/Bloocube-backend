// src/routes/admin.routes.js
const router = require('express').Router();
const { authenticate, authorize } = require('../middlewares/auth');
const ctrl = require('../controllers/adminController');

// Protect all admin routes
router.use(authenticate, authorize('admin'));

router.get('/dashboard', ctrl.dashboardStats);
router.get('/users', ctrl.listUsers);
router.patch('/users/:id/toggle', ctrl.toggleUserActive);
router.post('/users', ctrl.createUser);
router.delete('/users/:id', ctrl.deleteUser);
router.get('/campaigns', ctrl.listCampaigns);
router.get('/logs', ctrl.getLogs);
router.get('/settings', ctrl.getSettings);
router.put('/settings', ctrl.updateSettings);

module.exports = router;


