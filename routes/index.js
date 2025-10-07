const express = require('express');
const router = express.Router();

// Import route modules
const superAdminRoutes = require('./superAdmin');
const authRoutes = require('./auth');
const userRoutes = require('./users');
const requirementRoutes = require('./requirements');
const jobRoutes = require('./jobs');
const applicationRoutes = require('./applications');
const candidateRoutes = require('./candidates');
const dashboardRoutes = require('./dashboard');

// Super admin routes (uses master database)
router.use('/super-admin', superAdminRoutes);

// Tenant-specific routes (uses tenant database)
router.use('/auth', authRoutes);
router.use('/users', userRoutes);
router.use('/requirements', requirementRoutes);
router.use('/jobs', jobRoutes);
router.use('/applications', applicationRoutes);
router.use('/candidates', candidateRoutes);
router.use('/dashboard', dashboardRoutes);

module.exports = router;