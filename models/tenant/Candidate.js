const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const candidateSchema = new mongoose.Schema({
  personalInfo: {
    firstName: {
      type: String,
      required: [true, 'First name is required'],
      trim: true,
      maxlength: [50, 'First name cannot exceed 50 characters']
    },
    lastName: {
      type: String,
      required: [true, 'Last name is required'],
      trim: true,
      maxlength: [50, 'Last name cannot exceed 50 characters']
    },
    email: {
      type: String,
      required: [true, 'Email is required'],
      unique: true,
      lowercase: true,
      match: [
        /^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/,
        'Please provide a valid email'
      ]
    },
    phone: {
      type: String,
      required: [true, 'Phone number is required'],
      trim: true,
      match: [/^\+?[\d\s-()]+$/, 'Please provide a valid phone number']
    },
    dateOfBirth: Date,
    gender: {
      type: String,
      enum: ['male', 'female', 'other', 'prefer-not-to-say']
    },
    nationality: String,
    profilePicture: {
      url: String,
      publicId: String
    }
  },
  contactInfo: {
    address: {
      street: String,
      city: String,
      state: String,
      country: String,
      zipCode: String
    },
    linkedinUrl: {
      type: String,
      match: [/^https:\/\/(www\.)?linkedin\.com\/in\/[\w-]+\/?$/, 'Please provide a valid LinkedIn URL']
    },
    githubUrl: {
      type: String,
      match: [/^https:\/\/(www\.)?github\.com\/[\w-]+\/?$/, 'Please provide a valid GitHub URL']
    },
    portfolioUrl: {
      type: String,
      match: [/^https?:\/\/.+/, 'Please provide a valid URL']
    }
  },
  professionalInfo: {
    currentTitle: String,
    currentCompany: String,
    totalExperience: {
      type: Number,
      min: [0, 'Experience cannot be negative'],
      max: [50, 'Experience cannot exceed 50 years']
    },
    skills: [{
      name: {
        type: String,
        required: true,
        trim: true
      },
      level: {
        type: String,
        enum: ['beginner', 'intermediate', 'advanced', 'expert'],
        default: 'intermediate'
      },
      yearsOfExperience: {
        type: Number,
        min: 0,
        max: 30
      }
    }],
    industries: [String],
    preferredRoles: [String],
    salaryExpectation: {
      minimum: Number,
      maximum: Number,
      currency: {
        type: String,
        default: 'USD',
        uppercase: true
      }
    },
    availabilityDate: Date,
    noticePeriod: {
      type: String,
      enum: ['immediate', '15-days', '1-month', '2-months', '3-months', 'more-than-3-months']
    }
  },
  education: [{
    degree: {
      type: String,
      required: true
    },
    field: String,
    institution: {
      type: String,
      required: true
    },
    startYear: {
      type: Number,
      min: 1950,
      max: new Date().getFullYear()
    },
    endYear: {
      type: Number,
      min: 1950,
      max: new Date().getFullYear() + 10
    },
    grade: String,
    isCompleted: {
      type: Boolean,
      default: true
    }
  }],
  experience: [{
    title: {
      type: String,
      required: true
    },
    company: {
      type: String,
      required: true
    },
    location: String,
    startDate: {
      type: Date,
      required: true
    },
    endDate: Date,
    isCurrent: {
      type: Boolean,
      default: false
    },
    description: String,
    achievements: [String],
    technologies: [String]
  }],
  documents: {
    resume: {
      filename: String,
      url: String,
      publicId: String,
      uploadedAt: Date
    },
    coverLetter: {
      filename: String,
      url: String,
      publicId: String,
      uploadedAt: Date
    },
    portfolio: [{
      title: String,
      description: String,
      url: String,
      publicId: String,
      uploadedAt: Date
    }],
    certificates: [{
      title: String,
      issuer: String,
      issueDate: Date,
      expiryDate: Date,
      url: String,
      publicId: String
    }]
  },
  preferences: {
    jobTypes: [{
      type: String,
      enum: ['full-time', 'part-time', 'contract', 'internship', 'freelance']
    }],
    workLocation: [{
      type: String,
      enum: ['remote', 'onsite', 'hybrid']
    }],
    preferredLocations: [String],
    willingToRelocate: {
      type: Boolean,
      default: false
    }
  },
  account: {
    password: {
      type: String,
      required: [true, 'Password is required'],
      minlength: [8, 'Password must be at least 8 characters'],
      select: false
    },
    isActive: {
      type: Boolean,
      default: true
    },
    isEmailVerified: {
      type: Boolean,
      default: false
    },
    emailVerificationToken: String,
    emailVerificationExpire: Date,
    lastLogin: Date,
    loginAttempts: {
      type: Number,
      default: 0
    },
    lockUntil: Date,
    resetPasswordToken: String,
    resetPasswordExpire: Date
  }
}, {
  timestamps: true
});

// Indexes
candidateSchema.index({ 'personalInfo.email': 1 });
candidateSchema.index({ 'personalInfo.phone': 1 });
candidateSchema.index({ 'professionalInfo.skills.name': 1 });
candidateSchema.index({ 'professionalInfo.totalExperience': 1 });
candidateSchema.index({ 'professionalInfo.industries': 1 });
candidateSchema.index({ 'account.isActive': 1 });
candidateSchema.index({ createdAt: -1 });

// Virtual for full name
candidateSchema.virtual('fullName').get(function() {
  return `${this.personalInfo.firstName} ${this.personalInfo.lastName}`;
});

// Virtual for account lock status
candidateSchema.virtual('isLocked').get(function() {
  return !!(this.account.lockUntil && this.account.lockUntil > Date.now());
});

// Pre-save middleware to hash password
candidateSchema.pre('save', async function(next) {
  if (!this.isModified('account.password')) return next();
  
  this.account.password = await bcrypt.hash(this.account.password, 12);
  next();
});

// Instance method to check password
candidateSchema.methods.matchPassword = async function(enteredPassword) {
  return await bcrypt.compare(enteredPassword, this.account.password);
};

// Instance method to handle failed login attempts
candidateSchema.methods.incLoginAttempts = function() {
  if (this.account.lockUntil && this.account.lockUntil < Date.now()) {
    return this.updateOne({
      $unset: { 'account.lockUntil': 1 },
      $set: { 'account.loginAttempts': 1 }
    });
  }
  
  const updates = { $inc: { 'account.loginAttempts': 1 } };
  
  if (this.account.loginAttempts + 1 >= 5 && !this.isLocked) {
    updates.$set = { 'account.lockUntil': Date.now() + 2 * 60 * 60 * 1000 };
  }
  
  return this.updateOne(updates);
};

// Instance method to reset login attempts
candidateSchema.methods.resetLoginAttempts = function() {
  return this.updateOne({
    $unset: { 'account.loginAttempts': 1, 'account.lockUntil': 1 }
  });
};

// Static method to search candidates
candidateSchema.statics.searchCandidates = function(searchCriteria) {
  const query = { 'account.isActive': true };
  
  if (searchCriteria.skills && searchCriteria.skills.length > 0) {
    query['professionalInfo.skills.name'] = { $in: searchCriteria.skills };
  }
  
  if (searchCriteria.minExperience !== undefined) {
    query['professionalInfo.totalExperience'] = { $gte: searchCriteria.minExperience };
  }
  
  if (searchCriteria.maxExperience !== undefined) {
    query['professionalInfo.totalExperience'] = { 
      ...query['professionalInfo.totalExperience'],
      $lte: searchCriteria.maxExperience 
    };
  }
  
  if (searchCriteria.location) {
    query['contactInfo.address.city'] = new RegExp(searchCriteria.location, 'i');
  }
  
  return this.find(query);
};

module.exports = (connection) => {
  return connection.model('Candidate', candidateSchema);
};