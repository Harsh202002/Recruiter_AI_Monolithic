const mongoose = require('mongoose');

const requirementSchema = new mongoose.Schema({
  title: {
    type: String,
    required: [true, 'Requirement title is required'],
    trim: true,
    maxlength: [200, 'Title cannot exceed 200 characters']
  },
  description: {
    type: String,
    required: [true, 'Requirement description is required'],
    maxlength: [2000, 'Description cannot exceed 2000 characters']
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
  positions: {
    type: Number,
    required: [true, 'Number of positions is required'],
    min: [1, 'At least 1 position is required'],
    max: [100, 'Cannot exceed 100 positions']
  },
  location: {
    locationType: {
      type: String,
      enum: ['remote', 'onsite', 'hybrid'],
      required: [true, 'Location type is required']
    },
    city: String,
    state: String,
    country: String
  },
  employmentType: {
    type: String,
    enum: ['full-time', 'part-time', 'contract', 'internship'],
    required: [true, 'Employment type is required']
  },
  salary: {
    minimum: {
      type: Number,
      min: [0, 'Salary cannot be negative']
    },
    maximum: {
      type: Number,
      validate: {
        validator: function(v) {
          return !this.salary.minimum || v >= this.salary.minimum;
        },
        message: 'Maximum salary must be greater than or equal to minimum salary'
      }
    },
    currency: {
      type: String,
      default: 'USD',
      uppercase: true
    }
  },
  priority: {
    type: String,
    enum: ['low', 'medium', 'high', 'urgent'],
    default: 'medium'
  },
  status: {
    type: String,
    enum: ['draft', 'open', 'assigned', 'in_progress', 'completed', 'cancelled'],
    default: 'draft'
  },
  dueDate: {
    type: Date,
    required: [true, 'Due date is required'],
    validate: {
      validator: function(v) {
        return v > new Date();
      },
      message: 'Due date must be in the future'
    }
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'Creator is required']
  },
  assignedTo: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  assignedAt: Date,
  notes: [{
    content: {
      type: String,
      required: true,
      maxlength: [1000, 'Note cannot exceed 1000 characters']
    },
    addedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    addedAt: {
      type: Date,
      default: Date.now
    }
  }],
  attachments: [{
    filename: String,
    url: String,
    publicId: String,
    uploadedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    uploadedAt: {
      type: Date,
      default: Date.now
    }
  }]
}, {
  timestamps: true
});

// Indexes
requirementSchema.index({ createdBy: 1 });
requirementSchema.index({ assignedTo: 1 });
requirementSchema.index({ status: 1 });
requirementSchema.index({ priority: 1 });
requirementSchema.index({ dueDate: 1 });
requirementSchema.index({ createdAt: -1 });
requirementSchema.index({ 'skills.required': 1 });

// Virtual for days until due
requirementSchema.virtual('daysUntilDue').get(function() {
  if (!this.dueDate) return null;
  const now = new Date();
  const diffTime = this.dueDate - now;
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
});

// Virtual for overdue status
requirementSchema.virtual('isOverdue').get(function() {
  return this.dueDate && this.dueDate < new Date() && this.status !== 'completed';
});

// Pre-save middleware to set assignedAt when assignedTo changes
requirementSchema.pre('save', function(next) {
  if (this.isModified('assignedTo') && this.assignedTo) {
    this.assignedAt = new Date();
    if (this.status === 'draft') {
      this.status = 'assigned';
    }
  }
  next();
});

// Instance method to add note
requirementSchema.methods.addNote = function(content, userId) {
  this.notes.push({
    content,
    addedBy: userId
  });
  return this.save();
};

// Instance method to assign to recruiter
requirementSchema.methods.assignToRecruiter = function(recruiterId) {
  this.assignedTo = recruiterId;
  this.assignedAt = new Date();
  this.status = 'assigned';
  return this.save();
};

// Static method to find overdue requirements
requirementSchema.statics.findOverdue = function() {
  return this.find({
    dueDate: { $lt: new Date() },
    status: { $nin: ['completed', 'cancelled'] }
  });
};

// Static method to find by priority
requirementSchema.statics.findByPriority = function(priority) {
  return this.find({ priority, status: { $ne: 'cancelled' } });
};

module.exports = (connection) => {
  return connection.model('Requirement', requirementSchema);
};