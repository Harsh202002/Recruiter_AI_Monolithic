const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const {
  login,
  register,
  forgotPassword,
  resetPassword,
  updatePassword,
  getMe,
  updateProfile
} = require('../controllers/authController');

// Public routes
router.post('/login', login);
router.post('/register', register);
router.post('/forgot-password', forgotPassword);
router.put('/reset-password/:resetToken', resetPassword);

// Protected routes
router.use(protect);
router.get('/me', getMe);
router.put('/update-password', updatePassword);
router.put('/update-profile', updateProfile); 

module.exports = router;