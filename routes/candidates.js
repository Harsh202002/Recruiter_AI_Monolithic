const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');

const {
  registerCandidate,
  loginCandidate,
  getCandidateProfile,
  updateCandidateProfile,
  applyToJob,
  getCandidateApplications,
  uploadDocument
} = require('../controllers/candidateController');

// Public routes
router.post('/register', registerCandidate);
router.post('/login', loginCandidate);
router.post('/apply/:jobId', applyToJob);

// Protected routes (candidate authentication)
router.use(protect);
router.get('/profile', getCandidateProfile);
router.put('/profile', updateCandidateProfile);
router.get('/applications', getCandidateApplications);
router.post('/upload-document', uploadDocument);

module.exports = router;