const express = require('express');
const router = express.Router();
const { protect, authorize } = require('../middleware/auth');

const {
  getDashboardStats,
  getRecentActivity,
  getUpcomingDeadlines,
  getPerformanceMetrics
} = require('../controllers/dashboardController');

// All routes are protected
router.use(protect);

router.get('/stats', getDashboardStats);
router.get('/activity', getRecentActivity);
router.get('/deadlines', getUpcomingDeadlines);
router.get('/metrics', authorize('company_admin', 'rmg_admin'), getPerformanceMetrics);

module.exports = router;