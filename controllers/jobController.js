// @desc    Get all jobs
// @route   GET /api/jobs
// @access  Private
const getJobs = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 10,
      search,
      status,
      createdBy,
      requirementId,
      sortBy = 'createdAt',
      sortOrder = 'desc'
    } = req.query;

    const JobDescription = require('../models/tenant/JobDescription')(req.db);

    // Build query based on user role
    let query = {};
    
    if (req.user.role === 'recruiter') {
      // Recruiters can only see jobs they created
      query.createdBy = req.user._id;
    }

    if (search) {
      query.$or = [
        { title: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } },
        { 'skills.required': { $in: [new RegExp(search, 'i')] } }
      ];
    }

    if (status) query.status = status;
    if (createdBy) query.createdBy = createdBy;
    if (requirementId) query.requirementId = requirementId;

    // Execute query with pagination
    const options = {
      page: parseInt(page),
      limit: parseInt(limit),
      sort: { [sortBy]: sortOrder === 'desc' ? -1 : 1 }
    };

    const jobs = await JobDescription.find(query)
      .sort(options.sort)
      .limit(options.limit * 1)
      .skip((options.page - 1) * options.limit)
      .populate('requirementId', 'title priority dueDate')
      .populate('createdBy', 'name email');

    const total = await JobDescription.countDocuments(query);

    res.status(200).json({
      success: true,
      data: {
        jobs,
        pagination: {
          current: options.page,
          pages: Math.ceil(total / options.limit),
          total,
          limit: options.limit
        }
      }
    });
  } catch (error) {
    console.error('Get jobs error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching jobs',
      error: error.message
    });
  }
};

// @desc    Get single job
// @route   GET /api/jobs/:id
// @access  Private
const getJob = async (req, res) => {
  try {
    const JobDescription = require('../models/tenant/JobDescription')(req.db);
    
    const job = await JobDescription.findById(req.params.id)
      .populate('requirementId')
      .populate('createdBy', 'name email');

    if (!job) {
      return res.status(404).json({
        success: false,
        message: 'Job not found'
      });
    }

    // Check access permissions
    const hasAccess = req.user.role === 'company_admin' ||
                     req.user.role === 'rmg_admin' ||
                     job.createdBy._id.toString() === req.user._id.toString();

    if (!hasAccess) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to view this job'
      });
    }

    res.status(200).json({
      success: true,
      data: { job }
    });
  } catch (error) {
    console.error('Get job error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching job',
      error: error.message
    });
  }
};

// @desc    Get job by shareable link (public)
// @route   GET /api/jobs/public/:shareableLink
// @access  Public
const getJobByLink = async (req, res) => {
  try {
    const { shareableLink } = req.params;

    const JobDescription = require('../models/tenant/JobDescription')(req.db);
    
    const job = await JobDescription.findOne({ 
      shareableLink,
      isActive: true,
      status: 'published'
    }).populate('requirementId', 'title description');

    if (!job) {
      return res.status(404).json({
        success: false,
        message: 'Job not found or no longer available'
      });
    }

    // Check if application deadline has passed
    if (job.isDeadlinePassed) {
      return res.status(410).json({
        success: false,
        message: 'Application deadline has passed'
      });
    }

    // Increment view count
    await job.incrementViews();

    // Return job details without sensitive information
    const publicJobData = {
      id: job._id,
      title: job.title,
      description: job.description,
      responsibilities: job.responsibilities,
      qualifications: job.qualifications,
      skills: job.skills,
      experience: job.experience,
      location: job.location,
      employmentType: job.employmentType,
      salary: job.salary.showSalary ? job.salary : undefined,
      benefits: job.benefits,
      applicationDeadline: job.applicationDeadline,
      applicationSettings: job.applicationSettings,
      companyName: req.tenant.companyName,
      companyBranding: req.tenant.branding
    };

    res.status(200).json({
      success: true,
      data: { job: publicJobData }
    });
  } catch (error) {
    console.error('Get job by link error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching job',
      error: error.message
    });
  }
};

// @desc    Create job description
// @route   POST /api/jobs
// @access  Private (Company Admin, Recruiter)
const createJob = async (req, res) => {
  try {
    const {
      requirementId,
      title,
      description,
      responsibilities,
      qualifications,
      skills,
      experience,
      location,
      employmentType,
      salary,
      benefits,
      applicationDeadline,
      applicationSettings
    } = req.body;

    const JobDescription = require('../models/tenant/JobDescription')(req.db);
    const Requirement = require('../models/tenant/Requirement')(req.db);

    // Verify requirement exists and user has access
    const requirement = await Requirement.findById(requirementId);
    
    if (!requirement) {
      return res.status(404).json({
        success: false,
        message: 'Requirement not found'
      });
    }

    // Check if user can create job for this requirement
    const canCreate = req.user.role === 'company_admin' ||
                     (req.user.role === 'recruiter' && 
                      requirement.assignedTo && 
                      requirement.assignedTo.toString() === req.user._id.toString());

    if (!canCreate) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to create job for this requirement'
      });
    }

    const job = await JobDescription.create({
      requirementId,
      title,
      description,
      responsibilities,
      qualifications,
      skills,
      experience,
      location,
      employmentType,
      salary,
      benefits,
      applicationDeadline,
      applicationSettings,
      createdBy: req.user._id
    });

    await job.populate('requirementId', 'title priority');
    await job.populate('createdBy', 'name email');

    res.status(201).json({
      success: true,
      message: 'Job description created successfully',
      data: { job }
    });
  } catch (error) {
    console.error('Create job error:', error);
    res.status(500).json({
      success: false,
      message: 'Error creating job description',
      error: error.message
    });
  }
};

// @desc    Update job description
// @route   PUT /api/jobs/:id
// @access  Private
const updateJob = async (req, res) => {
  try {
    const JobDescription = require('../models/tenant/JobDescription')(req.db);
    
    const job = await JobDescription.findById(req.params.id);
    
    if (!job) {
      return res.status(404).json({
        success: false,
        message: 'Job not found'
      });
    }

    // Check if user can update this job
    const canUpdate = req.user.role === 'company_admin' ||
                     job.createdBy.toString() === req.user._id.toString();

    if (!canUpdate) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to update this job'
      });
    }

    const updatedJob = await JobDescription.findByIdAndUpdate(
      req.params.id,
      req.body,
      {
        new: true,
        runValidators: true
      }
    ).populate('requirementId', 'title priority')
     .populate('createdBy', 'name email');

    res.status(200).json({
      success: true,
      message: 'Job description updated successfully',
      data: { job: updatedJob }
    });
  } catch (error) {
    console.error('Update job error:', error);
    res.status(500).json({
      success: false,
      message: 'Error updating job description',
      error: error.message
    });
  }
};

// @desc    Delete job description
// @route   DELETE /api/jobs/:id
// @access  Private
const deleteJob = async (req, res) => {
  try {
    const JobDescription = require('../models/tenant/JobDescription')(req.db);
    
    const job = await JobDescription.findById(req.params.id);
    
    if (!job) {
      return res.status(404).json({
        success: false,
        message: 'Job not found'
      });
    }

    // Check if user can delete this job
    const canDelete = req.user.role === 'company_admin' ||
                     job.createdBy.toString() === req.user._id.toString();

    if (!canDelete) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to delete this job'
      });
    }

    // Check if job has applications
    const Application = require('../models/tenant/Application')(req.db);
    const applicationCount = await Application.countDocuments({ jobDescriptionId: req.params.id });

    if (applicationCount > 0) {
      return res.status(400).json({
        success: false,
        message: 'Cannot delete job with existing applications'
      });
    }

    await JobDescription.findByIdAndDelete(req.params.id);

    res.status(200).json({
      success: true,
      message: 'Job description deleted successfully'
    });
  } catch (error) {
    console.error('Delete job error:', error);
    res.status(500).json({
      success: false,
      message: 'Error deleting job description',
      error: error.message
    });
  }
};

// @desc    Publish job description
// @route   PATCH /api/jobs/:id/publish
// @access  Private (Company Admin, Recruiter)
const publishJob = async (req, res) => {
  try {
    const JobDescription = require('../models/tenant/JobDescription')(req.db);
    
    const job = await JobDescription.findById(req.params.id);
    
    if (!job) {
      return res.status(404).json({
        success: false,
        message: 'Job not found'
      });
    }

    // Check if user can publish this job
    const canPublish = req.user.role === 'company_admin' ||
                      job.createdBy.toString() === req.user._id.toString();

    if (!canPublish) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to publish this job'
      });
    }

    await job.publish();

    res.status(200).json({
      success: true,
      message: 'Job published successfully',
      data: { 
        job,
        shareableUrl: job.shareableUrl
      }
    });
  } catch (error) {
    console.error('Publish job error:', error);
    res.status(500).json({
      success: false,
      message: 'Error publishing job',
      error: error.message
    });
  }
};

// @desc    Close job description
// @route   PATCH /api/jobs/:id/close
// @access  Private (Company Admin, Recruiter)
const closeJob = async (req, res) => {
  try {
    const JobDescription = require('../models/tenant/JobDescription')(req.db);
    
    const job = await JobDescription.findById(req.params.id);
    
    if (!job) {
      return res.status(404).json({
        success: false,
        message: 'Job not found'
      });
    }

    // Check if user can close this job
    const canClose = req.user.role === 'company_admin' ||
                    job.createdBy.toString() === req.user._id.toString();

    if (!canClose) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to close this job'
      });
    }

    await job.close();

    res.status(200).json({
      success: true,
      message: 'Job closed successfully',
      data: { job }
    });
  } catch (error) {
    console.error('Close job error:', error);
    res.status(500).json({
      success: false,
      message: 'Error closing job',
      error: error.message
    });
  }
};

// @desc    Get job applications
// @route   GET /api/jobs/:id/applications
// @access  Private
const getJobApplications = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 10,
      status,
      sortBy = 'appliedAt',
      sortOrder = 'desc'
    } = req.query;

    const JobDescription = require('../models/tenant/JobDescription')(req.db);
    const Application = require('../models/tenant/Application')(req.db);
    
    const job = await JobDescription.findById(req.params.id);
    
    if (!job) {
      return res.status(404).json({
        success: false,
        message: 'Job not found'
      });
    }

    // Check if user can view applications for this job
    const canView = req.user.role === 'company_admin' ||
                   req.user.role === 'rmg_admin' ||
                   job.createdBy.toString() === req.user._id.toString();

    if (!canView) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to view applications for this job'
      });
    }

    // Build query
    const query = { jobDescriptionId: req.params.id };
    if (status) query.status = status;

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
    console.error('Get job applications error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching job applications',
      error: error.message
    });
  }
};

const { generateJobDescription } = require('../utils/geminiAI');

// @desc    Create AI-generated job description
// @route   POST /api/jobs/ai-generate
// @access  Private (Company Admin, Recruiter)
const createAIJob = async (req, res) => {
  try {
    const {
      requirementId,
      location,
      employmentType,
      experience,
      applicationDeadline
    } = req.body;

    if (!requirementId) {
      return res.status(400).json({
        success: false,
        message: 'Requirement ID is required'
      });
    }

    const JobDescription = require('../models/tenant/JobDescription')(req.db);
    const Requirement = require('../models/tenant/Requirement')(req.db);

    // Fetch requirement details
    const requirement = await Requirement.findById(requirementId);
    
    if (!requirement) {
      return res.status(404).json({
        success: false,
        message: 'Requirement not found'
      });
    }

    // Check if user can create job for this requirement
    const canCreate = req.user.role === 'company_admin' ||
                     (req.user.role === 'recruiter' && 
                      requirement.assignedTo && 
                      requirement.assignedTo.toString() === req.user._id.toString());

    if (!canCreate) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to create job for this requirement'
      });
    }

    // Safely handle skills - ensure it's always an array
    const requiredSkills = Array.isArray(requirement.skills) 
      ? requirement.skills
      : typeof requirement.skills === 'string' 
        ? [requirement.skills]
        : [];

    // Prepare data for AI generation
    const aiInputData = {
      title: requirement.title,
      industry: req.tenant.industry || 'Technology',
      companySize: req.tenant.companySize || '50-200',
      experience: experience,
      requiredSkills: requiredSkills.join(', '),
      location: location || requirement.location,
      employmentType: employmentType || 'Full-Time',
      businessContext: requirement.description || '',
      companyName: req.tenant.companyName,
      jobType: requirement.jobType || 'Permanent',
      salaryRange: requirement.salary 
        ? `${requirement.salary.min} - ${requirement.salary.max} ${requirement.salary.currency}` 
        : 'Competitive'
    };

    // Generate AI job description
    const aiGeneratedContent = await generateJobDescription(aiInputData);
    const parsedContent = JSON.parse(aiGeneratedContent);

    // Format experience object properly
    const experienceObj = {
      minimum: requirement.experienceRequired || 0,
      maximum: requirement.experienceRequired + 2 || 2, // Add a reasonable range
      preferredYears: requirement.experienceRequired || 1
    };

    // Create job with AI-generated content
    const job = await JobDescription.create({
      requirementId,
      title: requirement.title,
      description: parsedContent.description,
      responsibilities: parsedContent.responsibilities,
      qualifications: parsedContent.qualifications,
      skills: {
        required: requiredSkills,
        preferred: parsedContent.niceToHaveSkills || []
      },
      experience: experienceObj, // Use properly formatted experience object
      location: location || requirement.location,
      employmentType: employmentType || 'Full-Time',
      salary: requirement.salary,
      benefits: parsedContent.benefits,
      applicationDeadline: applicationDeadline || requirement.dueDate,
      createdBy: req.user._id,
      isAIGenerated: true,
      status: 'draft'
    });

    await job.populate('requirementId', 'title priority');
    await job.populate('createdBy', 'name email');

    res.status(201).json({
      success: true,
      message: 'AI-generated job description created successfully',
      data: { job }
    });
  } catch (error) {
    console.error('Create AI job error:', error);
    res.status(500).json({
      success: false,
      message: 'Error creating AI job description',
      error: error.message
    });
  }
};

module.exports = {
  getJobs,
  getJob,
  getJobByLink,
  createJob,
  updateJob,
  deleteJob,
  publishJob,
  closeJob,
  getJobApplications,
  createAIJob
};