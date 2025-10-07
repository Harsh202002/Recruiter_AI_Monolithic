const crypto = require('crypto');
const { sendEmail } = require('../utils/email');
const { generatePassword } = require('../utils/helpers');

// @desc    Get all users
// @route   GET /api/users
// @access  Private (Company Admin, RMG Admin)
const getUsers = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 10,
      search,
      role,
      department,
      isActive,
      sortBy = 'createdAt',
      sortOrder = 'desc'
    } = req.query;

    const User = require('../models/tenant/User')(req.db);

    // Build query
    const query = {};
    
    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } }
      ];
    }

    if (role) query.role = role;
    if (department) query.department = department;
    if (isActive !== undefined) query.isActive = isActive === 'true';

    // Execute query with pagination
    const options = {
      page: parseInt(page),
      limit: parseInt(limit),
      sort: { [sortBy]: sortOrder === 'desc' ? -1 : 1 }
    };

    const users = await User.find(query)
      .sort(options.sort)
      .limit(options.limit * 1)
      .skip((options.page - 1) * options.limit)
      .populate('createdBy', 'name email');

    const total = await User.countDocuments(query);

    res.status(200).json({
      success: true,
      data: {
        users,
        pagination: {
          current: options.page,
          pages: Math.ceil(total / options.limit),
          total,
          limit: options.limit
        }
      }
    });
  } catch (error) {
    console.error('Get users error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching users',
      error: error.message
    });
  }
};

// @desc    Get single user
// @route   GET /api/users/:id
// @access  Private
const getUser = async (req, res) => {
  try {
    const User = require('../models/tenant/User')(req.db);
    
    const user = await User.findById(req.params.id)
      .populate('createdBy', 'name email');

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Check if user can view this profile
    if (req.user.id !== req.params.id && 
        !['company_admin', 'rmg_admin'].includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to view this profile'
      });
    }

    res.status(200).json({
      success: true,
      data: { user }
    });
  } catch (error) {
    console.error('Get user error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching user',
      error: error.message
    });
  }
};

// @desc    Create user
// @route   POST /api/users
// @access  Private (Company Admin, RMG Admin)
const createUser = async (req, res) => {
    // Only one company admin per tenant
    if (role === 'company_admin') {
      const existingAdmin = await User.findOne({ role: 'company_admin', isActive: true });
      if (existingAdmin) {
        return res.status(400).json({
          success: false,
          message: 'Only one company admin is allowed per tenant.'
        });
      }
    }
  try {
    const { name, email, role, department, phone } = req.body;

    const User = require('../models/tenant/User')(req.db);

    // Check if user already exists
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({
        success: false,
        message: 'User with this email already exists'
      });
    }

    // Only one RMG admin per tenant
    if (role === 'rmg_admin') {
      const existingRmg = await User.findOne({ role: 'rmg_admin', isActive: true });
      if (existingRmg) {
        return res.status(400).json({
          success: false,
          message: 'Only one RMG admin is allowed per tenant.'
        });
      }
    }

    // Generate temporary password
    const tempPassword = generatePassword();

    // Create user (no invitation token for rmg_admin or recruiter)
    const user = await User.create({
      name,
      email,
      password: tempPassword,
      role,
      department,
      phone,
      createdBy: req.user._id,
      isEmailVerified: false
    });

    // Send credentials email
    await sendEmail({
      to: email,
      subject: `Your account for ${req.tenant.companyName}`,
      html: `
        <h2>Welcome to ${req.tenant.companyName}!</h2>
        <p>Your account has been created. Use the credentials below to log in:</p>
        <p><b>Email:</b> ${email}</p>
        <p><b>Password:</b> ${tempPassword}</p>
        <p>Login URL: <a href="${req.protocol}://${req.get('host')}/login">${req.protocol}://${req.get('host')}/login</a></p>
        <p>Please change your password after your first login.</p>
      `
    });

    res.status(201).json({
      success: true,
      message: 'User created successfully and credentials sent via email',
      data: {
        user: {
          id: user._id,
          name: user.name,
          email: user.email,
          role: user.role,
          department: user.department,
          isActive: user.isActive,
          createdAt: user.createdAt
        }
      }
    });
  } catch (error) {
    console.error('Create user error:', error);
    res.status(500).json({
      success: false,
      message: 'Error creating user',
      error: error.message
    });
  }
};

// @desc    Update user
// @route   PUT /api/users/:id
// @access  Private
const updateUser = async (req, res) => {
  try {
    const User = require('../models/tenant/User')(req.db);
    
    const user = await User.findById(req.params.id);
    
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Check permissions
    const canUpdate = req.user.id === req.params.id || 
                     ['company_admin', 'rmg_admin'].includes(req.user.role);
    
    if (!canUpdate) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to update this user'
      });
    }

    // Fields that can be updated
    const allowedFields = ['name', 'phone', 'profile', 'isActive'];
    
    // Admin can update role and department
    if (['company_admin', 'rmg_admin'].includes(req.user.role)) {
      allowedFields.push('role', 'department', 'permissions');
    }

    const updateData = {};
    allowedFields.forEach(field => {
      if (req.body[field] !== undefined) {
        updateData[field] = req.body[field];
      }
    });

    const updatedUser = await User.findByIdAndUpdate(
      req.params.id,
      updateData,
      {
        new: true,
        runValidators: true
      }
    );

    res.status(200).json({
      success: true,
      message: 'User updated successfully',
      data: { user: updatedUser }
    });
  } catch (error) {
    console.error('Update user error:', error);
    res.status(500).json({
      success: false,
      message: 'Error updating user',
      error: error.message
    });
  }
};

// @desc    Delete user
// @route   DELETE /api/users/:id
// @access  Private (Company Admin, RMG Admin)
const deleteUser = async (req, res) => {
  try {
    const User = require('../models/tenant/User')(req.db);
    
    const user = await User.findById(req.params.id);
    
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Prevent deleting company admin
    if (user.role === 'company_admin') {
      return res.status(400).json({
        success: false,
        message: 'Cannot delete company admin'
      });
    }

    // Soft delete by deactivating
    user.isActive = false;
    await user.save();

    res.status(200).json({
      success: true,
      message: 'User deactivated successfully'
    });
  } catch (error) {
    console.error('Delete user error:', error);
    res.status(500).json({
      success: false,
      message: 'Error deleting user',
      error: error.message
    });
  }
};

// @desc    Invite user
// @route   POST /api/users/invite
// @access  Private (Company Admin, RMG Admin)
const inviteUser = async (req, res) => {
  try {
    const { email, role, department, name } = req.body;

    const User = require('../models/tenant/User')(req.db);

    // Check if user already exists
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({
        success: false,
        message: 'User with this email already exists'
      });
    }

    // Generate invitation token
    const invitationToken = crypto.randomBytes(20).toString('hex');
    const hashedToken = crypto
      .createHash('sha256')
      .update(invitationToken)
      .digest('hex');

    // Create user with invitation token
    const user = await User.create({
      name: name || 'New User',
      email,
      password: generatePassword(), // Temporary password
      role,
      department,
      createdBy: req.user._id,
      isEmailVerified: false,
      emailVerificationToken: hashedToken,
      emailVerificationExpire: Date.now() + 24 * 60 * 60 * 1000 // 24 hours
    });

    // Send invitation email
    const invitationUrl = `${req.protocol}://${req.get('host')}/register?token=${invitationToken}`;
    
    await sendEmail({
      to: email,
      subject: `Invitation to join ${req.tenant.companyName}`,
      html: `
        <h2>You're invited to join ${req.tenant.companyName}!</h2>
        <p>Click the link below to complete your registration:</p>
        <a href="${invitationUrl}">Complete Registration</a>
        <p>This invitation expires in 24 hours.</p>
      `
    });

    res.status(201).json({
      success: true,
      message: 'Invitation sent successfully',
      data: {
        user: {
          id: user._id,
          email: user.email,
          role: user.role,
          department: user.department
        },
        invitationUrl
      }
    });
  } catch (error) {
    console.error('Invite user error:', error);
    res.status(500).json({
      success: false,
      message: 'Error sending invitation',
      error: error.message
    });
  }
};

module.exports = {
  getUsers,
  getUser,
  createUser,
  updateUser,
  deleteUser,
  inviteUser
};