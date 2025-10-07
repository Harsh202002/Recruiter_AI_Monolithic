const express = require('express');
const router = express.Router();
const { protect, superAdminOnly } = require('../middleware/auth');
const {
  registerSuperAdmin,
  loginSuperAdmin,
  createTenant,
  getAllTenants,
  getTenant,
  updateTenant,
  deactivateTenant,
  getTenantStats,
  getDashboardStats
} = require('../controllers/superAdminController');

// Auth routes
router.post('/register', registerSuperAdmin);
router.post('/login', loginSuperAdmin);

// Protected routes (require super admin authentication)
router.use(protect);
router.use(superAdminOnly);

// Tenant management
router.post('/tenants', createTenant);
router.get('/tenants', getAllTenants);
router.get('/tenants/:id', getTenant);
router.put('/tenants/:id', updateTenant);
router.patch('/tenants/:id/deactivate', deactivateTenant);
router.get('/tenants/:id/stats', getTenantStats);

// Dashboard
router.get('/dashboard/stats', getDashboardStats);

module.exports = router;