// @desc    Get all requirements
// @route   GET /api/requirements
// @access  Private
const getRequirements = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 10,
      search,
      status,
      priority,
      assignedTo,
      createdBy,
      sortBy = 'createdAt',
      sortOrder = 'desc'
    } = req.query;

    const Requirement = require('../models/tenant/Requirement')(req.db);

    // Build query based on user role
    let query = {};
    
    if (req.user.role === 'recruiter') {
      // Recruiters can only see requirements assigned to them
      query.assignedTo = req.user._id;
    }

    if (search) {
      query.$or = [
        { title: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } },
        { 'skills.required': { $in: [new RegExp(search, 'i')] } }
      ];
    }

    if (status) query.status = status;
    if (priority) query.priority = priority;
    if (assignedTo) query.assignedTo = assignedTo;
    if (createdBy) query.createdBy = createdBy;

    // Execute query with pagination
    const options = {
      page: parseInt(page),
      limit: parseInt(limit),
      sort: { [sortBy]: sortOrder === 'desc' ? -1 : 1 }
    };

    const requirements = await Requirement.find(query)
      .sort(options.sort)
      .limit(options.limit * 1)
      .skip((options.page - 1) * options.limit)
      .populate('createdBy', 'name email')
      .populate('assignedTo', 'name email');

    const total = await Requirement.countDocuments(query);

    res.status(200).json({
      success: true,
      data: {
        requirements,
        pagination: {
          current: options.page,
          pages: Math.ceil(total / options.limit),
          total,
          limit: options.limit
        }
      }
    });
  } catch (error) {
    console.error('Get requirements error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching requirements',
      error: error.message
    });
  }
};

// @desc    Get single requirement
// @route   GET /api/requirements/:id
// @access  Private
const getRequirement = async (req, res) => {
  try {
    const Requirement = require('../models/tenant/Requirement')(req.db);
    
    const requirement = await Requirement.findById(req.params.id)
      .populate('createdBy', 'name email')
      .populate('assignedTo', 'name email')
      .populate('notes.addedBy', 'name email');

    if (!requirement) {
      return res.status(404).json({
        success: false,
        message: 'Requirement not found'
      });
    }

    // Check access permissions
    const hasAccess = req.user.role === 'company_admin' ||
                     req.user.role === 'rmg_admin' ||
                     requirement.createdBy._id.toString() === req.user._id.toString() ||
                     (requirement.assignedTo && requirement.assignedTo._id.toString() === req.user._id.toString());

    if (!hasAccess) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to view this requirement'
      });
    }

    res.status(200).json({
      success: true,
      data: { requirement }
    });
  } catch (error) {
    console.error('Get requirement error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching requirement',
      error: error.message
    });
  }
};

// @desc    Create requirement
// @route   POST /api/requirements
// @access  Private (Company Admin, RMG Admin)
const createRequirement = async (req, res) => {
  try {
    const {
      title,
      description,
      skills,
      experience,
      positions,
      location,
      employmentType,
      salary,
      priority,
      dueDate
    } = req.body;

    const Requirement = require('../models/tenant/Requirement')(req.db);

    const requirement = await Requirement.create({
      title,
      description,
      skills,
      experience,
      positions,
      location,
      employmentType,
      salary,
      priority,
      dueDate,
      createdBy: req.user._id,
      status: 'open'
    });

    await requirement.populate('createdBy', 'name email');

    res.status(201).json({
      success: true,
      message: 'Requirement created successfully',
      data: { requirement }
    });
  } catch (error) {
    console.error('Create requirement error:', error);
    res.status(500).json({
      success: false,
      message: 'Error creating requirement',
      error: error.message
    });
  }
};

// @desc    Update requirement
// @route   PUT /api/requirements/:id
// @access  Private (Company Admin, RMG Admin)
const updateRequirement = async (req, res) => {
  try {
    const Requirement = require('../models/tenant/Requirement')(req.db);
    
    const requirement = await Requirement.findById(req.params.id);
    
    if (!requirement) {
      return res.status(404).json({
        success: false,
        message: 'Requirement not found'
      });
    }

    // Check if user can update this requirement
    const canUpdate = req.user.role === 'company_admin' ||
                     req.user.role === 'rmg_admin' ||
                     requirement.createdBy.toString() === req.user._id.toString();

    if (!canUpdate) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to update this requirement'
      });
    }

    const updatedRequirement = await Requirement.findByIdAndUpdate(
      req.params.id,
      req.body,
      {
        new: true,
        runValidators: true
      }
    ).populate('createdBy', 'name email')
     .populate('assignedTo', 'name email');

    res.status(200).json({
      success: true,
      message: 'Requirement updated successfully',
      data: { requirement: updatedRequirement }
    });
  } catch (error) {
    console.error('Update requirement error:', error);
    res.status(500).json({
      success: false,
      message: 'Error updating requirement',
      error: error.message
    });
  }
};

// @desc    Delete requirement
// @route   DELETE /api/requirements/:id
// @access  Private (Company Admin, RMG Admin)
const deleteRequirement = async (req, res) => {
  try {
    const Requirement = require('../models/tenant/Requirement')(req.db);
    
    const requirement = await Requirement.findById(req.params.id);
    
    if (!requirement) {
      return res.status(404).json({
        success: false,
        message: 'Requirement not found'
      });
    }

    // Check if user can delete this requirement
    const canDelete = req.user.role === 'company_admin' ||
                     req.user.role === 'rmg_admin' ||
                     requirement.createdBy.toString() === req.user._id.toString();

    if (!canDelete) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to delete this requirement'
      });
    }

    // Check if requirement has associated job descriptions
    const JobDescription = require('../models/tenant/JobDescription')(req.db);
    const associatedJobs = await JobDescription.countDocuments({ requirementId: req.params.id });

    if (associatedJobs > 0) {
      return res.status(400).json({
        success: false,
        message: 'Cannot delete requirement with associated job descriptions'
      });
    }

    await Requirement.findByIdAndDelete(req.params.id);

    res.status(200).json({
      success: true,
      message: 'Requirement deleted successfully'
    });
  } catch (error) {
    console.error('Delete requirement error:', error);
    res.status(500).json({
      success: false,
      message: 'Error deleting requirement',
      error: error.message
    });
  }
};

// @desc    Assign requirement to recruiter
// @route   PATCH /api/requirements/:id/assign
// @access  Private (Company Admin, RMG Admin)
const assignRequirement = async (req, res) => {
  try {
    const { recruiterId } = req.body;

    const Requirement = require('../models/tenant/Requirement')(req.db);
    const User = require('../models/tenant/User')(req.db);

    // Verify recruiter exists and has correct role
    const recruiter = await User.findOne({ 
      _id: recruiterId, 
      role: 'recruiter', 
      isActive: true 
    });

    if (!recruiter) {
      return res.status(400).json({
        success: false,
        message: 'Invalid recruiter ID'
      });
    }

    const requirement = await Requirement.findById(req.params.id);
    
    if (!requirement) {
      return res.status(404).json({
        success: false,
        message: 'Requirement not found'
      });
    }

    // Assign requirement
    await requirement.assignToRecruiter(recruiterId);

    await requirement.populate('assignedTo', 'name email');

    res.status(200).json({
      success: true,
      message: 'Requirement assigned successfully',
      data: { requirement }
    });
  } catch (error) {
    console.error('Assign requirement error:', error);
    res.status(500).json({
      success: false,
      message: 'Error assigning requirement',
      error: error.message
    });
  }
};

// @desc    Add note to requirement
// @route   POST /api/requirements/:id/notes
// @access  Private
const addNote = async (req, res) => {
  try {
    const { content } = req.body;

    const Requirement = require('../models/tenant/Requirement')(req.db);
    
    const requirement = await Requirement.findById(req.params.id);
    
    if (!requirement) {
      return res.status(404).json({
        success: false,
        message: 'Requirement not found'
      });
    }

    // Check access permissions
    const hasAccess = req.user.role === 'company_admin' ||
                     req.user.role === 'rmg_admin' ||
                     requirement.createdBy.toString() === req.user._id.toString() ||
                     (requirement.assignedTo && requirement.assignedTo.toString() === req.user._id.toString());

    if (!hasAccess) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to add notes to this requirement'
      });
    }

    await requirement.addNote(content, req.user._id);

    await requirement.populate('notes.addedBy', 'name email');

    res.status(200).json({
      success: true,
      message: 'Note added successfully',
      data: { requirement }
    });
  } catch (error) {
    console.error('Add note error:', error);
    res.status(500).json({
      success: false,
      message: 'Error adding note',
      error: error.message
    });
  }
};

module.exports = {
  getRequirements,
  getRequirement,
  createRequirement,
  updateRequirement,
  deleteRequirement,
  assignRequirement,
  addNote
};