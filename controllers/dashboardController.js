// @desc    Get dashboard statistics
// @route   GET /api/dashboard/stats
// @access  Private
const getDashboardStats = async (req, res) => {
  try {
    const User = require('../models/tenant/User')(req.db);
    const Requirement = require('../models/tenant/Requirement')(req.db);
    const JobDescription = require('../models/tenant/JobDescription')(req.db);
    const Application = require('../models/tenant/Application')(req.db);
    const Candidate = require('../models/tenant/Candidate')(req.db);

    // Build queries based on user role
    let requirementQuery = {};
    let jobQuery = {};
    let applicationQuery = {};

    if (req.user.role === 'recruiter') {
      // Recruiters see only their assigned requirements and created jobs
      requirementQuery.assignedTo = req.user._id;
      jobQuery.createdBy = req.user._id;
      
      const recruiterJobs = await JobDescription.find({ 
        createdBy: req.user._id 
      }).select('_id');
      
      applicationQuery.jobDescriptionId = { 
        $in: recruiterJobs.map(job => job._id) 
      };
    }

    // Get basic counts
    const [
      totalUsers,
      totalRecruiters,
      totalRequirements,
      totalJobs,
      activeJobs,
      totalApplications,
      totalCandidates,
      recentApplications
    ] = await Promise.all([
      User.countDocuments({ isActive: true }),
      User.countDocuments({ role: 'recruiter', isActive: true }),
      Requirement.countDocuments(requirementQuery),
      JobDescription.countDocuments(jobQuery),
      JobDescription.countDocuments({ ...jobQuery, isActive: true, status: 'published' }),
      Application.countDocuments(applicationQuery),
      Candidate.countDocuments({ 'account.isActive': true }),
      Application.countDocuments({
        ...applicationQuery,
        appliedAt: { $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) }
      })
    ]);

    // Get status distribution for requirements
    const requirementStatusDistribution = await Requirement.aggregate([
      { $match: requirementQuery },
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 }
        }
      }
    ]);

    // Get application status distribution
    const applicationStatusDistribution = await Application.aggregate([
      { $match: applicationQuery },
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 }
        }
      }
    ]);

    // Get priority distribution for requirements
    const priorityDistribution = await Requirement.aggregate([
      { $match: requirementQuery },
      {
        $group: {
          _id: '$priority',
          count: { $sum: 1 }
        }
      }
    ]);

    res.status(200).json({
      success: true,
      data: {
        overview: {
          totalUsers,
          totalRecruiters,
          totalRequirements,
          totalJobs,
          activeJobs,
          totalApplications,
          totalCandidates,
          recentApplications
        },
        distributions: {
          requirementStatus: requirementStatusDistribution,
          applicationStatus: applicationStatusDistribution,
          priority: priorityDistribution
        }
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

// @desc    Get recent activity
// @route   GET /api/dashboard/activity
// @access  Private
const getRecentActivity = async (req, res) => {
  try {
    const { limit = 10 } = req.query;

    const Application = require('../models/tenant/Application')(req.db);
    const JobDescription = require('../models/tenant/JobDescription')(req.db);
    const Requirement = require('../models/tenant/Requirement')(req.db);

    // Build queries based on user role
    let applicationQuery = {};
    let jobQuery = {};
    let requirementQuery = {};

    if (req.user.role === 'recruiter') {
      requirementQuery.assignedTo = req.user._id;
      jobQuery.createdBy = req.user._id;
      
      const recruiterJobs = await JobDescription.find({ 
        createdBy: req.user._id 
      }).select('_id');
      
      applicationQuery.jobDescriptionId = { 
        $in: recruiterJobs.map(job => job._id) 
      };
    }

    // Get recent activities
    const [
      recentApplications,
      recentJobs,
      recentRequirements
    ] = await Promise.all([
      Application.find(applicationQuery)
        .sort({ appliedAt: -1 })
        .limit(parseInt(limit))
        .populate('candidateId', 'personalInfo')
        .populate('jobDescriptionId', 'title'),
      
      JobDescription.find(jobQuery)
        .sort({ createdAt: -1 })
        .limit(parseInt(limit))
        .populate('createdBy', 'name')
        .populate('requirementId', 'title'),
      
      Requirement.find(requirementQuery)
        .sort({ createdAt: -1 })
        .limit(parseInt(limit))
        .populate('createdBy', 'name')
        .populate('assignedTo', 'name')
    ]);

    // Combine and sort all activities
    const activities = [];

    recentApplications.forEach(app => {
      activities.push({
        type: 'application',
        action: 'New application received',
        data: {
          candidateName: app.candidateId.personalInfo.firstName + ' ' + app.candidateId.personalInfo.lastName,
          jobTitle: app.jobDescriptionId.title,
          status: app.status
        },
        timestamp: app.appliedAt
      });
    });

    recentJobs.forEach(job => {
      activities.push({
        type: 'job',
        action: job.status === 'published' ? 'Job published' : 'Job created',
        data: {
          jobTitle: job.title,
          createdBy: job.createdBy.name,
          status: job.status
        },
        timestamp: job.publishedAt || job.createdAt
      });
    });

    recentRequirements.forEach(req => {
      activities.push({
        type: 'requirement',
        action: req.assignedTo ? 'Requirement assigned' : 'Requirement created',
        data: {
          title: req.title,
          createdBy: req.createdBy.name,
          assignedTo: req.assignedTo ? req.assignedTo.name : null,
          priority: req.priority
        },
        timestamp: req.assignedAt || req.createdAt
      });
    });

    // Sort by timestamp (most recent first)
    activities.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

    res.status(200).json({
      success: true,
      data: {
        activities: activities.slice(0, parseInt(limit))
      }
    });
  } catch (error) {
    console.error('Get recent activity error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching recent activity',
      error: error.message
    });
  }
};

// @desc    Get upcoming deadlines
// @route   GET /api/dashboard/deadlines
// @access  Private
const getUpcomingDeadlines = async (req, res) => {
  try {
    const Requirement = require('../models/tenant/Requirement')(req.db);
    const JobDescription = require('../models/tenant/JobDescription')(req.db);

    // Build queries based on user role
    let requirementQuery = {};
    let jobQuery = {};

    if (req.user.role === 'recruiter') {
      requirementQuery.assignedTo = req.user._id;
      jobQuery.createdBy = req.user._id;
    }

    const now = new Date();
    const nextWeek = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

    // Get upcoming requirement deadlines
    const upcomingRequirements = await Requirement.find({
      ...requirementQuery,
      dueDate: { $gte: now, $lte: nextWeek },
      status: { $nin: ['completed', 'cancelled'] }
    })
    .sort({ dueDate: 1 })
    .populate('createdBy', 'name')
    .populate('assignedTo', 'name');

    // Get upcoming job application deadlines
    const upcomingJobs = await JobDescription.find({
      ...jobQuery,
      applicationDeadline: { $gte: now, $lte: nextWeek },
      isActive: true,
      status: 'published'
    })
    .sort({ applicationDeadline: 1 })
    .populate('createdBy', 'name');

    // Combine deadlines
    const deadlines = [];

    upcomingRequirements.forEach(req => {
      deadlines.push({
        type: 'requirement',
        title: req.title,
        deadline: req.dueDate,
        priority: req.priority,
        assignedTo: req.assignedTo ? req.assignedTo.name : null,
        daysLeft: Math.ceil((req.dueDate - now) / (1000 * 60 * 60 * 24))
      });
    });

    upcomingJobs.forEach(job => {
      deadlines.push({
        type: 'job_application',
        title: job.title,
        deadline: job.applicationDeadline,
        createdBy: job.createdBy.name,
        applicationsCount: job.analytics.applications,
        daysLeft: Math.ceil((job.applicationDeadline - now) / (1000 * 60 * 60 * 24))
      });
    });

    // Sort by deadline
    deadlines.sort((a, b) => new Date(a.deadline) - new Date(b.deadline));

    res.status(200).json({
      success: true,
      data: { deadlines }
    });
  } catch (error) {
    console.error('Get upcoming deadlines error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching upcoming deadlines',
      error: error.message
    });
  }
};

// @desc    Get performance metrics
// @route   GET /api/dashboard/metrics
// @access  Private (Company Admin, RMG Admin)
const getPerformanceMetrics = async (req, res) => {
  try {
    const { period = '30' } = req.query; // days
    const startDate = new Date(Date.now() - parseInt(period) * 24 * 60 * 60 * 1000);

    const User = require('../models/tenant/User')(req.db);
    const Requirement = require('../models/tenant/Requirement')(req.db);
    const JobDescription = require('../models/tenant/JobDescription')(req.db);
    const Application = require('../models/tenant/Application')(req.db);

    // Get recruiter performance
    const recruiterPerformance = await User.aggregate([
      { $match: { role: 'recruiter', isActive: true } },
      {
        $lookup: {
          from: 'jobdescriptions',
          localField: '_id',
          foreignField: 'createdBy',
          as: 'jobs'
        }
      },
      {
        $lookup: {
          from: 'applications',
          localField: 'jobs._id',
          foreignField: 'jobDescriptionId',
          as: 'applications'
        }
      },
      {
        $project: {
          name: 1,
          email: 1,
          jobsCreated: { $size: '$jobs' },
          applicationsReceived: { $size: '$applications' },
          activeJobs: {
            $size: {
              $filter: {
                input: '$jobs',
                cond: { $eq: ['$$this.isActive', true] }
              }
            }
          }
        }
      }
    ]);

    // Get application conversion rates
    const conversionRates = await Application.aggregate([
      { $match: { appliedAt: { $gte: startDate } } },
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 }
        }
      }
    ]);

    // Get time-to-hire metrics
    const timeToHire = await Application.aggregate([
      {
        $match: {
          status: 'selected',
          appliedAt: { $gte: startDate }
        }
      },
      {
        $project: {
          daysToHire: {
            $divide: [
              { $subtract: ['$updatedAt', '$appliedAt'] },
              1000 * 60 * 60 * 24
            ]
          }
        }
      },
      {
        $group: {
          _id: null,
          averageDays: { $avg: '$daysToHire' },
          minDays: { $min: '$daysToHire' },
          maxDays: { $max: '$daysToHire' }
        }
      }
    ]);

    // Get job posting effectiveness
    const jobEffectiveness = await JobDescription.aggregate([
      { $match: { createdAt: { $gte: startDate } } },
      {
        $lookup: {
          from: 'applications',
          localField: '_id',
          foreignField: 'jobDescriptionId',
          as: 'applications'
        }
      },
      {
        $project: {
          title: 1,
          views: '$analytics.views',
          applications: { $size: '$applications' },
          conversionRate: {
            $cond: {
              if: { $gt: ['$analytics.views', 0] },
              then: {
                $multiply: [
                  { $divide: [{ $size: '$applications' }, '$analytics.views'] },
                  100
                ]
              },
              else: 0
            }
          }
        }
      },
      { $sort: { conversionRate: -1 } },
      { $limit: 10 }
    ]);

    res.status(200).json({
      success: true,
      data: {
        recruiterPerformance,
        conversionRates,
        timeToHire: timeToHire[0] || { averageDays: 0, minDays: 0, maxDays: 0 },
        jobEffectiveness
      }
    });
  } catch (error) {
    console.error('Get performance metrics error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching performance metrics',
      error: error.message
    });
  }
};

module.exports = {
  getDashboardStats,
  getRecentActivity,
  getUpcomingDeadlines,
  getPerformanceMetrics
};