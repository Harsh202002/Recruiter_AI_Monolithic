const mongoose = require('mongoose');
const { v4: uuidv4 } = require('uuid');

const jobDescriptionSchema = new mongoose.Schema({
  requirementId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Requirement',
    required: [true, 'Requirement ID is required']
  },
  title: {
    type: String,
    required: [true, 'Job title is required'],
    trim: true,
    maxlength: [200, 'Title cannot exceed 200 characters']
  },
  description: {
    type: String,
    required: [true, 'Job description is required'],
    maxlength: [5000, 'Description cannot exceed 5000 characters']
  },
  responsibilities: [{
    type: String,
    trim: true,
    maxlength: [500, 'Responsibility cannot exceed 500 characters']
  }],
  qualifications: {
    required: [{
      type: String,
      trim: true
    }],
    preferred: [{
      type: String,
      trim: true
    }]
  },
  skills: {
    required: [{
      type: String,
      trim: true
    }],
    preferred: [{
      type: String,
      trim: true
    }]
  },
  experience: {
    minimum: {
      type: Number,
      required: [true, 'Minimum experience is required'],
      min: [0, 'Experience cannot be negative']
    },
    maximum: {
      type: Number,
      validate: {
        validator: function(v) {
          return v >= this.experience.minimum;
        },
        message: 'Maximum experience must be greater than or equal to minimum experience'
      }
    }
  },
  location: {
    locationType: {
      type: String,
      enum: ['remote', 'onsite', 'hybrid'],
      required: [true, 'Location type is required']
    },
    city: String,
    state: String,
    country: String,
    address: String
  },
  employmentType: {
    type: String,
    enum: ['full-time', 'part-time', 'contract', 'internship'],
    required: [true, 'Employment type is required']
  },
  salary: {
    minimum: Number,
    maximum: Number,
    currency: {
      type: String,
      default: 'USD',
      uppercase: true
    },
    showSalary: {
      type: Boolean,
      default: true
    }
  },
  benefits: [{
    type: String,
    trim: true
  }],
  applicationDeadline: {
    type: Date,
    validate: {
      validator: function(v) {
        return v > new Date();
      },
      message: 'Application deadline must be in the future'
    }
  },
  shareableLink: {
    type: String,
    unique: true,
    default: function() {
      return uuidv4();
    }
  },
  isActive: {
    type: Boolean,
    default: true
  },
  status: {
    type: String,
    enum: ['draft', 'published', 'paused', 'closed'],
    default: 'draft'
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'Creator is required']
  },
  publishedAt: Date,
  closedAt: Date,
  applicationSettings: {
    requireCoverLetter: {
      type: Boolean,
      default: false
    },
    allowMultipleApplications: {
      type: Boolean,
      default: false
    },
    customQuestions: [{
      question: {
        type: String,
        required: true,
        maxlength: [500, 'Question cannot exceed 500 characters']
      },
      type: {
        type: String,
        enum: ['text', 'textarea', 'select', 'multiselect', 'boolean'],
        default: 'text'
      },
      options: [String], // For select/multiselect questions
      required: {
        type: Boolean,
        default: false
      }
    }]
  },
  analytics: {
    views: {
      type: Number,
      default: 0
    },
    applications: {
      type: Number,
      default: 0
    },
    lastViewed: Date
  }
}, {
  timestamps: true
});

// Indexes
jobDescriptionSchema.index({ requirementId: 1 });
jobDescriptionSchema.index({ createdBy: 1 });
jobDescriptionSchema.index({ shareableLink: 1 });
jobDescriptionSchema.index({ isActive: 1 });
jobDescriptionSchema.index({ status: 1 });
jobDescriptionSchema.index({ publishedAt: -1 });
jobDescriptionSchema.index({ 'skills.required': 1 });
jobDescriptionSchema.index({ 'location.locationType': 1 });
jobDescriptionSchema.index({ employmentType: 1 });

// Virtual for full shareable URL
jobDescriptionSchema.virtual('shareableUrl').get(function() {
  const baseUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
  return `${baseUrl}/jobs/${this.shareableLink}`;
});

// Virtual for days until application deadline
jobDescriptionSchema.virtual('daysUntilDeadline').get(function() {
  if (!this.applicationDeadline) return null;
  const now = new Date();
  const diffTime = this.applicationDeadline - now;
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
});

// Virtual for application deadline passed
jobDescriptionSchema.virtual('isDeadlinePassed').get(function() {
  return this.applicationDeadline && this.applicationDeadline < new Date();
});

// Pre-save middleware to set publishedAt when status changes to published
jobDescriptionSchema.pre('save', function(next) {
  if (this.isModified('status') && this.status === 'published' && !this.publishedAt) {
    this.publishedAt = new Date();
  }
  
  if (this.isModified('status') && this.status === 'closed' && !this.closedAt) {
    this.closedAt = new Date();
  }
  
  next();
});

// Instance method to increment view count
jobDescriptionSchema.methods.incrementViews = function() {
  this.analytics.views += 1;
  this.analytics.lastViewed = new Date();
  return this.save();
};

// Instance method to increment application count
jobDescriptionSchema.methods.incrementApplications = function() {
  this.analytics.applications += 1;
  return this.save();
};

// Instance method to publish job
jobDescriptionSchema.methods.publish = function() {
  this.status = 'published';
  this.isActive = true;
  this.publishedAt = new Date();
  return this.save();
};

// Instance method to close job
jobDescriptionSchema.methods.close = function() {
  this.status = 'closed';
  this.isActive = false;
  this.closedAt = new Date();
  return this.save();
};

// Static method to find active jobs
jobDescriptionSchema.statics.findActive = function() {
  return this.find({ 
    isActive: true, 
    status: 'published',
    $or: [
      { applicationDeadline: { $exists: false } },
      { applicationDeadline: { $gt: new Date() } }
    ]
  });
};

// Static method to find by recruiter
jobDescriptionSchema.statics.findByRecruiter = function(recruiterId) {
  return this.find({ createdBy: recruiterId });
};

module.exports = (connection) => {
  return connection.model('JobDescription', jobDescriptionSchema);
};