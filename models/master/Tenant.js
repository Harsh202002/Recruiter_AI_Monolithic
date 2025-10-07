const mongoose = require('mongoose');
const slugify = require('slugify');

const tenantSchema = new mongoose.Schema({
  companyName: {
    type: String,
    required: [true, 'Company name is required'],
    trim: true,
    maxlength: [100, 'Company name cannot exceed 100 characters']
  },
  subdomain: {
    type: String,
    required: [true, 'Subdomain is required'],
    unique: true,
    lowercase: true,
    match: [/^[a-z0-9-]+$/, 'Subdomain can only contain lowercase letters, numbers, and hyphens'],
    minlength: [3, 'Subdomain must be at least 3 characters'],
    maxlength: [30, 'Subdomain cannot exceed 30 characters']
  },
  email: {
    type: String,
    required: [true, 'Company email is required'],
    lowercase: true,
    match: [
      /^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/,
      'Please provide a valid email'
    ]
  },
  phone: {
    type: String,
    trim: true,
    match: [/^\+?[\d\s-()]+$/, 'Please provide a valid phone number']
  },
  address: {
    street: String,
    city: String,
    state: String,
    country: String,
    zipCode: String
  },
  branding: {
    logo: {
      url: String,
      publicId: String // Cloudinary public ID
    },
    wallpaper: {
      url: String,
      publicId: String
    },
    primaryColor: {
      type: String,
      default: '#007bff',
      match: [/^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/, 'Please provide a valid hex color']
    },
    secondaryColor: {
      type: String,
      default: '#6c757d',
      match: [/^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/, 'Please provide a valid hex color']
    },
    theme: {
      type: String,
      enum: ['light', 'dark'],
      default: 'light'
    }
  },
  subscription: {
    plan: {
      type: String,
      enum: ['basic', 'premium', 'enterprise'],
      default: 'basic'
    },
    status: {
      type: String,
      enum: ['active', 'suspended', 'cancelled'],
      default: 'active'
    },
    startDate: {
      type: Date,
      default: Date.now
    },
    endDate: Date,
    maxUsers: {
      type: Number,
      default: 10
    },
    maxRecruiters: {
      type: Number,
      default: 5
    }
  },
  adminCredentials: {
    username: {
      type: String,
      required: [true, 'Admin username is required'],
      unique: true,
      minlength: [3, 'Username must be at least 3 characters']
    },
    tempPassword: {
      type: String,
      required: [true, 'Temporary password is required'],
      select: false
    },
    passwordChanged: {
      type: Boolean,
      default: false
    }
  },
  isActive: {
    type: Boolean,
    default: true
  },
  settings: {
    allowCandidateRegistration: {
      type: Boolean,
      default: true
    },
    requireEmailVerification: {
      type: Boolean,
      default: true
    },
    maxApplicationsPerCandidate: {
      type: Number,
      default: 10
    }
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'SuperAdmin',
    required: true
  },
  lastActivity: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

// Indexes
tenantSchema.index({ subdomain: 1 });
// Removed duplicate email index to avoid Mongoose warning
tenantSchema.index({ isActive: 1 });
tenantSchema.index({ 'subscription.status': 1 });
tenantSchema.index({ createdAt: -1 });

// Pre-save middleware to generate subdomain from company name if not provided
tenantSchema.pre('save', function(next) {
  if (!this.subdomain && this.companyName) {
    let baseSubdomain = slugify(this.companyName, {
      lower: true,
      strict: true,
      remove: /[*+~.()'"!:@]/g
    });
    
    // Ensure subdomain is not too long
    if (baseSubdomain.length > 30) {
      baseSubdomain = baseSubdomain.substring(0, 30);
    }
    
    this.subdomain = baseSubdomain;
  }
  next();
});

// Instance method to check if tenant can add more users
tenantSchema.methods.canAddUsers = function(currentUserCount) {
  return currentUserCount < this.subscription.maxUsers;
};

// Instance method to check if tenant can add more recruiters
tenantSchema.methods.canAddRecruiters = function(currentRecruiterCount) {
  return currentRecruiterCount < this.subscription.maxRecruiters;
};

// Instance method to update last activity
tenantSchema.methods.updateActivity = function() {
  this.lastActivity = new Date();
  return this.save();
};

// Static method to find active tenants
tenantSchema.statics.findActive = function() {
  return this.find({ 
    isActive: true, 
    'subscription.status': 'active' 
  });
};

module.exports = (connection) => {
  return connection.model('Tenant', tenantSchema);
};