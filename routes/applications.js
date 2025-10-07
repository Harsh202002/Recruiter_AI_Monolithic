const express = require('express');
const router = express.Router();
const { protect, authorize } = require('../middleware/auth');

const {
  getApplications,
  getApplication,
  updateApplicationStatus,
  scheduleInterview,
  addFeedback,
  getApplicationStats
} = require('../controllers/applicationController');

// All routes are protected
router.use(protect);

router.get('/', getApplications);
router.get('/stats', authorize('company_admin', 'rmg_admin'), getApplicationStats);
router.get('/:id', getApplication);
router.patch('/:id/status', updateApplicationStatus);
router.post('/:id/interview', scheduleInterview);
router.post('/:id/feedback', addFeedback);

module.exports = router;