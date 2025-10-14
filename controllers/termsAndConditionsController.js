const { TermsAndConditions } = require('../models');
const { createTermsAndConditions, updateTermsAndConditions, updateStatus } = require('../validations/termsAndConditionsValidation');
const { createError } = require('../utils/errorHandler');
const logger = require('../utils/logger');
const { Op } = require('sequelize');

// Get socket service instance
const getSocketService = () => {
  return global.socketService;
};

// Create new Terms & Conditions (single or multiple)
const createTermsAndConditionsHandler = async (req, res, next) => {
  try {
    // Check if request body contains array (multiple terms) or single object
    if (Array.isArray(req.body)) {
      // Multiple terms and conditions
      const termsAndConditions = req.body;

      // Validate that termsAndConditions is a non-empty array
      if (termsAndConditions.length === 0) {
        return next(createError(400, 'termsAndConditions must be a non-empty array'));
      }

      // Validate each terms and conditions item
      const validatedItems = [];
      const errors = [];

      for (let i = 0; i < termsAndConditions.length; i++) {
        const item = termsAndConditions[i];
        const { error, value } = createTermsAndConditions.validate(item);
        
        if (error) {
          errors.push({
            index: i,
            error: error.details[0].message
          });
        } else {
          // Check if title already exists
          const existingTerms = await TermsAndConditions.findOne({ where: { title: value.title } });
          if (existingTerms) {
            errors.push({
              index: i,
              title: value.title,
              error: 'Terms & Conditions with this title already exists'
            });
          } else {
            validatedItems.push({
              ...value,
              lastUpdatedBy: req.user.id
            });
          }
        }
      }

      // If there are validation errors, return them
      if (errors.length > 0) {
        return res.status(400).json({
          success: false,
          message: 'Validation errors found',
          errors: errors
        });
      }

      // Create all terms and conditions
      const createdTerms = await TermsAndConditions.bulkCreate(validatedItems);

      logger.info(`Bulk created ${createdTerms.length} Terms & Conditions`);

      res.status(201).json({
        success: true,
        message: `${createdTerms.length} Terms & Conditions created successfully`,
        data: { 
          termsAndConditions: createdTerms,
          count: createdTerms.length
        }
      });

    } else {
      // Single terms and conditions
      const { error, value } = createTermsAndConditions.validate(req.body);
      if (error) {
        return next(createError(400, error.details[0].message));
      }

      // Check if title already exists
      const existingTerms = await TermsAndConditions.findOne({ where: { title: value.title } });
      if (existingTerms) {
        return next(createError(400, 'Terms & Conditions with this title already exists'));
      }

      // Add user ID who is creating/updating
      value.lastUpdatedBy = req.user.id;

      // Create Terms & Conditions
      const termsAndConditions = await TermsAndConditions.create(value);

      logger.info(`Terms & Conditions created: ${termsAndConditions.title}`);

      // Emit socket notification for terms creation
      const socketService = getSocketService();
      if (socketService) {
        socketService.emitTermsCreated({
          id: termsAndConditions.id,
          title: termsAndConditions.title,
          status: termsAndConditions.status,
          createdBy: req.user.email || 'admin'
        });
      }

      res.status(201).json({
        success: true,
        message: 'Terms & Conditions created successfully',
        data: { termsAndConditions }
      });
    }
  } catch (error) {
    next(error);
  }
};

// Get all Terms & Conditions
const getAllTermsAndConditions = async (req, res, next) => {
  try {
    const { page = 1, limit = 10, status, search, id } = req.query;
    const offset = (page - 1) * limit;

    // If ID is provided, get specific Terms & Conditions
    if (id) {
      const termsAndConditions = await TermsAndConditions.findByPk(id);
      if (!termsAndConditions) {
        return next(createError(404, 'Terms & Conditions not found'));
      }

      return res.status(200).json({
        success: true,
        message: 'Terms & Conditions retrieved successfully',
        data: { termsAndConditions }
      });
    }

    // Build where clause
    const whereClause = {};
    if (status) {
      whereClause.status = status;
    }
    if (search) {
      whereClause[Op.or] = [
        { title: { [Op.iLike]: `%${search}%` } },
        { description: { [Op.iLike]: `%${search}%` } }
      ];
    }

    const termsAndConditions = await TermsAndConditions.findAndCountAll({
      where: whereClause,
      limit: parseInt(limit),
      offset: parseInt(offset),
      order: [['createdAt', 'DESC']]
    });

    const totalPages = Math.ceil(termsAndConditions.count / limit);

    res.status(200).json({
      success: true,
      message: 'Terms & Conditions retrieved successfully',
      data: {
        termsAndConditions: termsAndConditions.rows,
        pagination: {
          currentPage: parseInt(page),
          totalPages,
          totalItems: termsAndConditions.count,
          itemsPerPage: parseInt(limit)
        }
      }
    });
  } catch (error) {
    next(error);
  }
};

// Get Terms & Conditions by ID
const getTermsAndConditionsById = async (req, res, next) => {
  try {
    const { id } = req.params;
    
    const termsAndConditions = await TermsAndConditions.findByPk(id);
    
    if (!termsAndConditions) {
      return next(createError(404, 'Terms & Conditions not found'));
    }

    res.status(200).json({
      success: true,
      message: 'Terms & Conditions retrieved successfully',
      data: { termsAndConditions }
    });
  } catch (error) {
    next(error);
  }
};

// Update Terms & Conditions
const updateTermsAndConditionsHandler = async (req, res, next) => {
  try {
    const { id } = req.params;

    // Validate request body
    const { error, value } = updateTermsAndConditions.validate(req.body);
    if (error) {
      return next(createError(400, error.details[0].message));
    }

    const termsAndConditions = await TermsAndConditions.findByPk(id);
    if (!termsAndConditions) {
      return next(createError(404, 'Terms & Conditions not found'));
    }

    // Check if title is being updated and if it already exists
    if (value.title && value.title !== termsAndConditions.title) {
      const existingTerms = await TermsAndConditions.findOne({ where: { title: value.title } });
      if (existingTerms) {
        return next(createError(400, 'Terms & Conditions with this title already exists'));
      }
    }

    // Add user ID who is updating
    value.lastUpdatedBy = req.user.id;

    // Update Terms & Conditions
    await termsAndConditions.update(value);

    logger.info(`Terms & Conditions updated: ${termsAndConditions.title}`);

    // Emit socket notification for terms update
    const socketService = getSocketService();
    if (socketService) {
      socketService.emitTermsUpdated({
        id: termsAndConditions.id,
        title: termsAndConditions.title,
        status: termsAndConditions.status,
        updatedBy: req.user.email || 'admin'
      });
    }

    res.status(200).json({
      success: true,
      message: 'Terms & Conditions updated successfully',
      data: { termsAndConditions }
    });
  } catch (error) {
    next(error);
  }
};

// Delete Terms & Conditions
const deleteTermsAndConditions = async (req, res, next) => {
  try {
    const { id } = req.params;

    const termsAndConditions = await TermsAndConditions.findByPk(id);
    if (!termsAndConditions) {
      return next(createError(404, 'Terms & Conditions not found'));
    }

    await termsAndConditions.destroy();

    logger.info(`Terms & Conditions deleted: ${termsAndConditions.title}`);

    res.status(200).json({
      success: true,
      message: 'Terms & Conditions deleted successfully'
    });
  } catch (error) {
    next(error);
  }
};

// Update Terms & Conditions status
const updateTermsAndConditionsStatus = async (req, res, next) => {
  try {
    const { id } = req.params;

    // Validate request body
    const { error, value } = updateStatus.validate(req.body);
    if (error) {
      return next(createError(400, error.details[0].message));
    }

    const termsAndConditions = await TermsAndConditions.findByPk(id);
    if (!termsAndConditions) {
      return next(createError(404, 'Terms & Conditions not found'));
    }

    // Update status
    await termsAndConditions.update({ 
      status: value.status,
      lastUpdatedBy: req.user.id 
    });

    logger.info(`Terms & Conditions status updated: ${termsAndConditions.title} - ${value.status}`);

    res.status(200).json({
      success: true,
      message: 'Terms & Conditions status updated successfully',
      data: { termsAndConditions }
    });
  } catch (error) {
    next(error);
  }
};

// Get Terms & Conditions by status
const getTermsAndConditionsByStatus = async (req, res, next) => {
  try {
    const { status } = req.params;

    if (!['active', 'inactive'].includes(status)) {
      return next(createError(400, 'Invalid status. Must be active or inactive'));
    }

    const termsAndConditions = await TermsAndConditions.findAll({
      where: { status },
      order: [['createdAt', 'DESC']]
    });

    res.status(200).json({
      success: true,
      message: `${status} Terms & Conditions retrieved successfully`,
      data: { termsAndConditions }
    });
  } catch (error) {
    next(error);
  }
};

// Get active Terms & Conditions (for public use)
const getActiveTermsAndConditions = async (req, res, next) => {
  try {
    const termsAndConditions = await TermsAndConditions.findAll({
      where: { status: 'active' },
      order: [['createdAt', 'DESC']]
    });

    res.status(200).json({
      success: true,
      message: 'Active Terms & Conditions retrieved successfully',
      data: { termsAndConditions }
    });
  } catch (error) {
    next(error);
  }
};


module.exports = {
  createTermsAndConditionsHandler,
  getAllTermsAndConditions,
  getTermsAndConditionsById,
  updateTermsAndConditionsHandler,
  deleteTermsAndConditions,
  updateTermsAndConditionsStatus,
  getTermsAndConditionsByStatus,
  getActiveTermsAndConditions
};
