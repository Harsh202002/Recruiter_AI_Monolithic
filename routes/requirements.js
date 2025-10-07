const express = require('express');
const router = express.Router();
const { protect, authorize } = require('../middleware/auth');

// All routes are protected
router.use(protect);

const {
  getRequirements,
  getRequirement,
  createRequirement,
  updateRequirement,
  deleteRequirement,
  assignRequirement,
  addNote
} = require('../controllers/requirementController');

// Routes accessible by company_admin and rmg_admin
router.get('/', getRequirements);
router.post('/', authorize('company_admin', 'rmg_admin'), createRequirement);

// Routes accessible by all authenticated users (with proper filtering)
router.get('/:id', getRequirement);

// Routes accessible by company_admin and rmg_admin
router.put('/:id', authorize('company_admin', 'rmg_admin'), updateRequirement);
router.delete('/:id', authorize('company_admin', 'rmg_admin'), deleteRequirement);
router.patch('/:id/assign', authorize('company_admin', 'rmg_admin'), assignRequirement);
router.post('/:id/notes', addNote);

module.exports = router;