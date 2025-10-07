const express = require('express');
const router = express.Router();
const { protect, authorize } = require('../middleware/auth');

// All routes are protected
router.use(protect);

// Import controller functions (to be created)
const {
  getUsers,
  getUser,
  createUser,
  updateUser,
  deleteUser,
  inviteUser
} = require('../controllers/userController');

// Routes accessible by company_admin and rmg_admin
router.get('/', authorize('company_admin', 'rmg_admin'), getUsers);
router.post('/', authorize('company_admin', 'rmg_admin'), createUser);
router.post('/invite', authorize('company_admin', 'rmg_admin'), inviteUser);

// Routes accessible by all authenticated users
router.get('/:id', getUser);

// Routes accessible by company_admin and rmg_admin (and self)
router.put('/:id', updateUser);
router.delete('/:id', authorize('company_admin', 'rmg_admin'), deleteUser);

module.exports = router;