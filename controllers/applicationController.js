// @desc    Get all applications
// @route   GET /api/applications
// @access  Private
const getApplications = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 10,
      status,
      jobId,
      candidateId,
      sortBy = 'appliedAt',
      sortOrder = 'desc'
    } = req.query;

    const Application = require('../models/tenant/Application')(req.db);

    // Build query based on user role
    let query = {};
    
    if (req.user.role === 'recruiter') {
      // Recruiters can only see applications for jobs they created
      const JobDescription = require('../models/tenant/JobDescription')(req.db);
      const recruiterJobs = await JobDescription.find({ 
        createdBy: req.user._id 
      }).select('_id');
      
      query.jobDescriptionId = { 
        $in: recruiterJobs.map(job => job._id) 
      };
    }

    if (status) query.status = status;
    if (jobId) query.jobDescriptionId = jobId;
    if (candidateId) query.candidateId = candidateId;

    // Execute query with pagination
    const options = {
      page: parseInt(page),
      limit: parseInt(limit),
      sort: { [sortBy]: sortOrder === 'desc' ? -1 : 1 }
    };

    const applications = await Application.find(query)
      .sort(options.sort)
      .limit(options.limit * 1)
      .skip((options.page - 1) * options.limit)
      .populate('jobDescriptionId', 'title status location employmentType')
      .populate('candidateId', 'personalInfo professionalInfo contactInfo');

    const total = await Application.countDocuments(query);

    res.status(200).json({
      success: true,
      data: {
        applications,
        pagination: {
          current: options.page,
          pages: Math.ceil(total / options.limit),
          total,
          limit: options.limit
        }
      }
    });
  } catch (error) {
    console.error('Get applications error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching applications',
      error: error.message
    });
  }
};

// @desc    Get single application
// @route   GET /api/applications/:id
// @access  Private
const getApplication = async (req, res) => {
  try {
    const Application = require('../models/tenant/Application')(req.db);
    
    const application = await Application.findById(req.params.id)
      .populate('jobDescriptionId')
      .populate('candidateId')
      .populate('interviews.interviewer', 'name email')
      .populate('timeline.performedBy', 'name email')
      .populate('communication.sentBy', 'name email');

    if (!application) {
      return res.status(404).json({
        success: false,
        message: 'Application not found'
      });
    }

    // Check access permissions
    const JobDescription = require('../models/tenant/JobDescription')(req.db);
    const job = await JobDescription.findById(application.jobDescriptionId);
    
    const hasAccess = req.user.role === 'company_admin' ||
                     req.user.role === 'rmg_admin' ||
                     (job && job.createdBy.toString() === req.user._id.toString());

    if (!hasAccess) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to view this application'
      });
    }

    res.status(200).json({
      success: true,
      data: { application }
    });
  } catch (error) {
    console.error('Get application error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching application',
      error: error.message
    });
  }
};

// @desc    Update application status
// @route   PATCH /api/applications/:id/status
// @access  Private
const updateApplicationStatus = async (req, res) => {
  try {
    const { status, notes } = req.body;

    const Application = require('../models/tenant/Application')(req.db);
    
    const application = await Application.findById(req.params.id);
    
    if (!application) {
      return res.status(404).json({
        success: false,
        message: 'Application not found'
      });
    }

    // Check access permissions
    const JobDescription = require('../models/tenant/JobDescription')(req.db);
    const job = await JobDescription.findById(application.jobDescriptionId);
    
    const hasAccess = req.user.role === 'company_admin' ||
                     req.user.role === 'rmg_admin' ||
                     (job && job.createdBy.toString() === req.user._id.toString());

    if (!hasAccess) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to update this application'
      });
    }

    // Update status with timeline
    await application.updateStatus(status, req.user._id, notes);

    await application.populate('candidateId', 'personalInfo');

    res.status(200).json({
      success: true,
      message: 'Application status updated successfully',
      data: { application }
    });
  } catch (error) {
    console.error('Update application status error:', error);
    res.status(500).json({
      success: false,
      message: 'Error updating application status',
      error: error.message
    });
  }
};

// @desc    Schedule interview
// @route   POST /api/applications/:id/interview
// @access  Private
const scheduleInterview = async (req, res) => {
  try {
    const {
      type,
      scheduledAt,
      duration,
      interviewer,
      meetingLink,
      location
    } = req.body;

    const Application = require('../models/tenant/Application')(req.db);
    
    const application = await Application.findById(req.params.id);
    
    if (!application) {
      return res.status(404).json({
        success: false,
        message: 'Application not found'
      });
    }

    // Check access permissions
    const JobDescription = require('../models/tenant/JobDescription')(req.db);
    const job = await JobDescription.findById(application.jobDescriptionId);
    
    const hasAccess = req.user.role === 'company_admin' ||
                     req.user.role === 'rmg_admin' ||
                     (job && job.createdBy.toString() === req.user._id.toString());

    if (!hasAccess) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to schedule interview for this application'
      });
    }

    // Verify interviewer exists
    const User = require('../models/tenant/User')(req.db);
    const interviewerUser = await User.findById(interviewer);
    
    if (!interviewerUser) {
      return res.status(400).json({
        success: false,
        message: 'Invalid interviewer ID'
      });
    }

    // Schedule interview
    const interviewData = {
      type,
      scheduledAt: new Date(scheduledAt),
      duration,
      interviewer,
      meetingLink,
      location
    };

    await application.scheduleInterview(interviewData);

    await application.populate('interviews.interviewer', 'name email');

    res.status(200).json({
      success: true,
      message: 'Interview scheduled successfully',
      data: { application }
    });
  } catch (error) {
    console.error('Schedule interview error:', error);
    res.status(500).json({
      success: false,
      message: 'Error scheduling interview',
      error: error.message
    });
  }
};

// @desc    Add feedback to application
// @route   POST /api/applications/:id/feedback
// @access  Private
const addFeedback = async (req, res) => {
  try {
    const {
      recruiterNotes,
      internalNotes,
      rating,
      tags
    } = req.body;

    const Application = require('../models/tenant/Application')(req.db);
    
    const application = await Application.findById(req.params.id);
    
    if (!application) {
      return res.status(404).json({
        success: false,
        message: 'Application not found'
      });
    }

    // Check access permissions
    const JobDescription = require('../models/tenant/JobDescription')(req.db);
    const job = await JobDescription.findById(application.jobDescriptionId);
    
    const hasAccess = req.user.role === 'company_admin' ||
                     req.user.role === 'rmg_admin' ||
                     (job && job.createdBy.toString() === req.user._id.toString());

    if (!hasAccess) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to add feedback to this application'
      });
    }

    // Update feedback
    application.feedback = {
      recruiterNotes,
      internalNotes,
      rating,
      tags
    };

    // Add timeline entry
    application.timeline.push({
      action: 'Feedback added',
      performedBy: req.user._id,
      performedAt: new Date(),
      notes: 'Recruiter feedback added'
    });

    await application.save();

    res.status(200).json({
      success: true,
      message: 'Feedback added successfully',
      data: { application }
    });
  } catch (error) {
    console.error('Add feedback error:', error);
    res.status(500).json({
      success: false,
      message: 'Error adding feedback',
      error: error.message
    });
  }
};

// @desc    Get application statistics
// @route   GET /api/applications/stats
// @access  Private (Company Admin, RMG Admin)
const getApplicationStats = async (req, res) => {
  try {
    const Application = require('../models/tenant/Application')(req.db);

    // Get overall statistics
    const [
      totalApplications,
      statusDistribution,
      recentApplications,
      topJobs
    ] = await Promise.all([
      Application.countDocuments(),
      
      Application.aggregate([
        {
          $group: {
            _id: '$status',
            count: { $sum: 1 }
          }
        }
      ]),
      
      Application.countDocuments({
        appliedAt: { $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) }
      }),
      
      Application.aggregate([
        {
          $group: {
            _id: '$jobDescriptionId',
            count: { $sum: 1 }
          }
        },
        { $sort: { count: -1 } },
        { $limit: 5 },
        {
          $lookup: {
            from: 'jobdescriptions',
            localField: '_id',
            foreignField: '_id',
            as: 'job'
          }
        }
      ])
    ]);

    res.status(200).json({
      success: true,
      data: {
        totalApplications,
        statusDistribution,
        recentApplications,
        topJobs
      }
    });
  } catch (error) {
    console.error('Get application stats error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching application statistics',
      error: error.message
    });
  }
};

module.exports = {
  getApplications,
  getApplication,
  updateApplicationStatus,
  scheduleInterview,
  addFeedback,
  getApplicationStats
};