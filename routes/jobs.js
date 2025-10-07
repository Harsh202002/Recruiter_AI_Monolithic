const express = require('express');
const router = express.Router();
const { protect, authorize } = require('../middleware/auth');

const {
  getJobs,
  getJob,
  getJobByLink,
  createJob,
  updateJob,
  deleteJob,
  publishJob,
  closeJob,
  getJobApplications
} = require('../controllers/jobController');

// Public routes (for candidates to view jobs)
router.get('/public/:shareableLink', getJobByLink);

// Protected routes
router.use(protect);

router.get('/', getJobs);
router.post('/', authorize('company_admin', 'recruiter'), createJob);

router.get('/:id', getJob);
router.put('/:id', updateJob);
router.delete('/:id', deleteJob);
router.patch('/:id/publish', authorize('company_admin', 'recruiter'), publishJob);
router.patch('/:id/close', authorize('company_admin', 'recruiter'), closeJob);
router.get('/:id/applications', getJobApplications);

module.exports = router;