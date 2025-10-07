const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const dbManager = require('../config/database');
const { sendEmail } = require('../utils/email');
const { generatePassword } = require('../utils/helpers');

// Generate JWT token
const generateToken = (payload) => {
  return jwt.sign(payload, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRE || '7d'
  });
};

// @desc    Register super admin
// @route   POST /api/super-admin/register
// @access  Public (should be restricted in production)
const registerSuperAdmin = async (req, res) => {
  try {
    const { name, email, password } = req.body;

    // Initialize master DB if not already done
    if (!dbManager.masterConnection) {
      await dbManager.initializeMasterDB();
    }

    const SuperAdmin = require('../models/master/SuperAdmin')(dbManager.getMasterConnection());

    // Check if super admin already exists
    const existingSuperAdmin = await SuperAdmin.findOne({ email });
    if (existingSuperAdmin) {
      return res.status(400).json({
        success: false,
        message: 'Super admin with this email already exists'
      });
    }

    // Create super admin
    const superAdmin = await SuperAdmin.create({
      name,
      email,
      password
    });

  // Generate token with role
  const token = generateToken({ id: superAdmin._id, role: 'super_admin' });

    res.status(201).json({
      success: true,
      message: 'Super admin registered successfully',
      data: {
        superAdmin: {
          id: superAdmin._id,
          name: superAdmin.name,
          email: superAdmin.email,
          role: superAdmin.role
        },
        token
      }
    });
  } catch (error) {
    console.error('Super admin registration error:', error);
    res.status(500).json({
      success: false,
      message: 'Error registering super admin',
      error: error.message
    });
  }
};

// @desc    Login super admin
// @route   POST /api/super-admin/login
// @access  Public
const loginSuperAdmin = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Please provide email and password'
      });
    }

    // Initialize master DB if not already done
    if (!dbManager.masterConnection) {
      await dbManager.initializeMasterDB();
    }

    const SuperAdmin = require('../models/master/SuperAdmin')(dbManager.getMasterConnection());

    // Find super admin and include password
    const superAdmin = await SuperAdmin.findOne({ email }).select('+password');

    if (!superAdmin) {
      return res.status(401).json({
        success: false,
        message: 'Invalid credentials'
      });
    }

    // Check if account is locked
    if (superAdmin.isLocked) {
      return res.status(423).json({
        success: false,
        message: 'Account is temporarily locked due to too many failed login attempts'
      });
    }

    // Check if account is active
    if (!superAdmin.isActive) {
      return res.status(401).json({
        success: false,
        message: 'Account is deactivated'
      });
    }

    // Check password
    const isPasswordValid = await superAdmin.matchPassword(password);

    if (!isPasswordValid) {
      await superAdmin.incLoginAttempts();
      return res.status(401).json({
        success: false,
        message: 'Invalid credentials'
      });
    }

    // Reset login attempts on successful login
    if (superAdmin.loginAttempts > 0) {
      await superAdmin.resetLoginAttempts();
    }

    // Update last login
    superAdmin.lastLogin = new Date();
    await superAdmin.save();

  // Generate token with role
  const token = generateToken({ id: superAdmin._id, role: 'super_admin' });

    res.status(200).json({
      success: true,
      message: 'Login successful',
      data: {
        superAdmin: {
          id: superAdmin._id,
          name: superAdmin.name,
          email: superAdmin.email,
          role: superAdmin.role,
          lastLogin: superAdmin.lastLogin
        },
        token
      }
    });
  } catch (error) {
    console.error('Super admin login error:', error);
    res.status(500).json({
      success: false,
      message: 'Error during login',
      error: error.message
    });
  }
};

// @desc    Create new tenant
// @route   POST /api/super-admin/tenants
// @access  Private (Super Admin)
const createTenant = async (req, res) => {
  try {
    const {
      companyName,
      email,
      phone,
      address,
      subscription = {}
    } = req.body;

    const slugify = require('slugify');
    const Tenant = require('../models/master/Tenant')(dbManager.getMasterConnection());

    // Generate unique subdomain (slug) from company name
    let baseSubdomain = slugify(companyName, {
      lower: true,
      strict: true,
      remove: /[*+~.()'"!:@]/g
    });
    if (baseSubdomain.length > 30) baseSubdomain = baseSubdomain.substring(0, 30);

    // Ensure subdomain is unique (add number if needed)
    let subdomain = baseSubdomain;
    let counter = 1;
    while (await Tenant.findOne({ subdomain })) {
      subdomain = `${baseSubdomain}-${counter}`;
      if (subdomain.length > 30) subdomain = subdomain.substring(0, 30);
      counter++;
    }

    // Check if email already exists
    const existingEmail = await Tenant.findOne({ email });
    if (existingEmail) {
      return res.status(400).json({
        success: false,
        message: 'Tenant with this email already exists'
      });
    }

    // Generate admin credentials
    const adminUsername = subdomain + '_admin';
    const tempPassword = generatePassword();

    // Create tenant
    const tenant = await Tenant.create({
      companyName,
      email,
      phone,
      address,
      subdomain,
      subscription: {
        plan: subscription.plan || 'basic',
        maxUsers: subscription.maxUsers || 10,
        maxRecruiters: subscription.maxRecruiters || 5
      },
      adminCredentials: {
        username: adminUsername,
        tempPassword: await bcrypt.hash(tempPassword, 12)
      },
      createdBy: req.user._id
    });

    // Check if tenant and tenant._id exist
    if (!tenant || !tenant._id) {
      return res.status(500).json({
        success: false,
        message: 'Failed to create tenant. Please check required fields.'
      });
    }

    // Create tenant database using subdomain as DB name
    await dbManager.createTenantDB(subdomain);

    // Create company admin user in tenant database
    const tenantDB = await dbManager.getTenantDB(subdomain);
    const User = require('../models/tenant/User')(tenantDB);

    await User.create({
      name: `${companyName} Admin`,
      email: email,
      password: tempPassword,
      role: 'company_admin',
      isEmailVerified: true,
      createdBy: null // First user, no creator
    });

    // Send welcome email with credentials
    const emailData = {
      companyName,
      subdomain,
      username: adminUsername,
      password: tempPassword,
      loginUrl: `${process.env.FRONTEND_URL || 'http://localhost:3000'}`
    };

    await sendEmail({
      to: email,
      subject: `Welcome to ${process.env.APP_NAME || 'Multi-Tenant App'} - Your Account is Ready!`,
      template: 'tenant-welcome',
      data: emailData
    });

    res.status(201).json({
      success: true,
      message: 'Tenant created successfully',
      data: {
        tenant: {
          id: tenant._id,
          companyName: tenant.companyName,
          subdomain: tenant.subdomain,
          email: tenant.email,
          isActive: tenant.isActive,
          subscription: tenant.subscription,
          createdAt: tenant.createdAt
        },
        credentials: {
          username: adminUsername,
          tempPassword: tempPassword,
          loginUrl: `${process.env.FRONTEND_URL || 'http://localhost:3000'}`
        }
      }
    });
  } catch (error) {
    console.error('Tenant creation error:', error);
    res.status(500).json({
      success: false,
      message: 'Error creating tenant',
      error: error.message
    });
  }
};

// @desc    Get all tenants
// @route   GET /api/super-admin/tenants
// @access  Private (Super Admin)
const getAllTenants = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 10,
      search,
      status,
      plan,
      sortBy = 'createdAt',
      sortOrder = 'desc'
    } = req.query;

    const Tenant = require('../models/master/Tenant')(dbManager.getMasterConnection());

    // Build query
    const query = {};
    
    if (search) {
      query.$or = [
        { companyName: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } },
        { subdomain: { $regex: search, $options: 'i' } }
      ];
    }

    if (status) {
      query['subscription.status'] = status;
    }

    if (plan) {
      query['subscription.plan'] = plan;
    }

    // Execute query with pagination
    const options = {
      page: parseInt(page),
      limit: parseInt(limit),
      sort: { [sortBy]: sortOrder === 'desc' ? -1 : 1 },
      populate: {
        path: 'createdBy',
        select: 'name email'
      }
    };

    const tenants = await Tenant.find(query)
      .populate(options.populate)
      .sort(options.sort)
      .limit(options.limit * 1)
      .skip((options.page - 1) * options.limit);

    const total = await Tenant.countDocuments(query);

    res.status(200).json({
      success: true,
      data: {
        tenants,
        pagination: {
          current: options.page,
          pages: Math.ceil(total / options.limit),
          total,
          limit: options.limit
        }
      }
    });
  } catch (error) {
    console.error('Get tenants error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching tenants',
      error: error.message
    });
  }
};

// @desc    Get single tenant
// @route   GET /api/super-admin/tenants/:id
// @access  Private (Super Admin)
const getTenant = async (req, res) => {
  try {
    const Tenant = require('../models/master/Tenant')(dbManager.getMasterConnection());

    const tenant = await Tenant.findById(req.params.id)
      .populate('createdBy', 'name email');

    if (!tenant) {
      return res.status(404).json({
        success: false,
        message: 'Tenant not found'
      });
    }

    res.status(200).json({
      success: true,
      data: { tenant }
    });
  } catch (error) {
    console.error('Get tenant error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching tenant',
      error: error.message
    });
  }
};

// @desc    Update tenant
// @route   PUT /api/super-admin/tenants/:id
// @access  Private (Super Admin)
const updateTenant = async (req, res) => {
  try {
    const Tenant = require('../models/master/Tenant')(dbManager.getMasterConnection());

    const tenant = await Tenant.findByIdAndUpdate(
      req.params.id,
      req.body,
      {
        new: true,
        runValidators: true
      }
    );

    if (!tenant) {
      return res.status(404).json({
        success: false,
        message: 'Tenant not found'
      });
    }

    res.status(200).json({
      success: true,
      message: 'Tenant updated successfully',
      data: { tenant }
    });
  } catch (error) {
    console.error('Update tenant error:', error);
    res.status(500).json({
      success: false,
      message: 'Error updating tenant',
      error: error.message
    });
  }
};

// @desc    Deactivate tenant
// @route   PATCH /api/super-admin/tenants/:id/deactivate
// @access  Private (Super Admin)
const deactivateTenant = async (req, res) => {
  try {
    const Tenant = require('../models/master/Tenant')(dbManager.getMasterConnection());

    const tenant = await Tenant.findByIdAndUpdate(
      req.params.id,
      { isActive: false },
      { new: true }
    );

    if (!tenant) {
      return res.status(404).json({
        success: false,
        message: 'Tenant not found'
      });
    }

    res.status(200).json({
      success: true,
      message: 'Tenant deactivated successfully',
      data: { tenant }
    });
  } catch (error) {
    console.error('Deactivate tenant error:', error);
    res.status(500).json({
      success: false,
      message: 'Error deactivating tenant',
      error: error.message
    });
  }
};

// @desc    Get tenant statistics
// @route   GET /api/super-admin/tenants/:id/stats
// @access  Private (Super Admin)
const getTenantStats = async (req, res) => {
  try {
    const tenantId = req.params.id;
  // Use subdomain as DB name for tenant DB
  const tenantDB = await dbManager.getTenantDB(req.tenant ? req.tenant.subdomain : tenantId);

    const User = require('../models/tenant/User')(tenantDB);
    const Requirement = require('../models/tenant/Requirement')(tenantDB);
    const JobDescription = require('../models/tenant/JobDescription')(tenantDB);
    const Application = require('../models/tenant/Application')(tenantDB);

    const [
      totalUsers,
      totalRecruiters,
      totalRequirements,
      totalJobs,
      totalApplications,
      activeJobs
    ] = await Promise.all([
      User.countDocuments({ isActive: true }),
      User.countDocuments({ role: 'recruiter', isActive: true }),
      Requirement.countDocuments(),
      JobDescription.countDocuments(),
      Application.countDocuments(),
      JobDescription.countDocuments({ isActive: true, status: 'published' })
    ]);

    res.status(200).json({
      success: true,
      data: {
        users: {
          total: totalUsers,
          recruiters: totalRecruiters
        },
        requirements: {
          total: totalRequirements
        },
        jobs: {
          total: totalJobs,
          active: activeJobs
        },
        applications: {
          total: totalApplications
        }
      }
    });
  } catch (error) {
    console.error('Get tenant stats error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching tenant statistics',
      error: error.message
    });
  }
};

// @desc    Get dashboard statistics
// @route   GET /api/super-admin/dashboard/stats
// @access  Private (Super Admin)
const getDashboardStats = async (req, res) => {
  try {
    const Tenant = require('../models/master/Tenant')(dbManager.getMasterConnection());

    const [
      totalTenants,
      activeTenants,
      inactiveTenants,
      recentTenants
    ] = await Promise.all([
      Tenant.countDocuments(),
      Tenant.countDocuments({ isActive: true, 'subscription.status': 'active' }),
      Tenant.countDocuments({ $or: [{ isActive: false }, { 'subscription.status': { $ne: 'active' } }] }),
      Tenant.find().sort({ createdAt: -1 }).limit(5).select('companyName subdomain createdAt')
    ]);

    // Get subscription plan distribution
    const planDistribution = await Tenant.aggregate([
      {
        $group: {
          _id: '$subscription.plan',
          count: { $sum: 1 }
        }
      }
    ]);

    res.status(200).json({
      success: true,
      data: {
        tenants: {
          total: totalTenants,
          active: activeTenants,
          inactive: inactiveTenants
        },
        planDistribution,
        recentTenants
      }
    });
  } catch (error) {
    console.error('Get dashboard stats error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching dashboard statistics',
      error: error.message
    });
  }
};

module.exports = {
  registerSuperAdmin,
  loginSuperAdmin,
  createTenant,
  getAllTenants,
  getTenant,
  updateTenant,
  deactivateTenant,
  getTenantStats,
  getDashboardStats
};