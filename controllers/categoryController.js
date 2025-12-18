const { Category, User, AgencyOwner } = require('../models');
const { createError } = require('../utils/errorHandler');
const logger = require('../utils/logger');
const { Op } = require('sequelize');
const notificationService = require('../services/notificationService');

// Create a new category (Admin only)
const createCategory = async (req, res, next) => {
  try {
    // Only admin can create categories
    if (!req.user || req.user.role !== 'admin') {
      return next(createError(403, 'Only admin can create categories'));
    }

    const { name } = req.body;

    // Validate input
    if (!name || name.trim().length < 2) {
      return next(createError(400, 'Category name must be at least 2 characters long'));
    }

    // Check if category name already exists
    const existingCategory = await Category.findOne({ 
      where: { 
        name: name.trim()
      } 
    });
    
    if (existingCategory) {
      return next(createError(400, 'Category name already exists'));
    }

    // Create category
    const category = await Category.create({
      name: name.trim()
    });

    logger.info(`Category created: ${category.name} by admin`);

    // Send Firebase notification to customers and agency owners about new category
    try {
      // Get customer tokens
      const customers = await User.findAll({ 
        where: { role: 'customer', isBlocked: false },
        attributes: ['fcmToken']
      });
      const customerTokens = customers.map(c => c.fcmToken).filter(token => token);

      // Get agency owner tokens
      const agencyOwners = await AgencyOwner.findAll({
        where: { isActive: true },
        attributes: ['fcmToken']
      });
      const ownerTokens = agencyOwners.map(o => o.fcmToken).filter(token => token);

      const allTokens = [...customerTokens, ...ownerTokens];
      
      if (allTokens.length > 0) {
        await notificationService.sendToMultipleDevices(
          allTokens,
          'New Category Added! 🆕',
          `Check out our new category: "${category.name}"`,
          { type: 'CATEGORY_CREATED', categoryId: category.id, categoryName: category.name },
          {
            recipientType: 'multiple',
            notificationType: 'CUSTOM'
          }
        );
        logger.info(`Category notification sent to ${allTokens.length} users`);
      }
    } catch (notifError) {
      logger.error('Error sending category notification:', notifError.message);
    }

    res.status(201).json({
      success: true,
      message: 'Category created successfully',
      data: { category }
    });
  } catch (error) {
    next(error);
  }
};

// Get all categories
const getAllCategories = async (req, res, next) => {
  try {
    const { page = 1, limit = 10, status, search } = req.query;
    const offset = (page - 1) * limit;

    // Build where clause
    const whereClause = {};
    
    if (status) {
      whereClause.status = status;
    } else {
      // Role-based default filtering
      if (req.user && req.user.role === 'customer') {
        // Customers only see active categories by default
        whereClause.status = 'active';
      }
      // Admin and agency owners see all categories (no status filter)
    }
    
    if (search) {
      whereClause[Op.or] = [
        { name: { [Op.iLike]: `%${search}%` } }
      ];
    }

    const categories = await Category.findAndCountAll({
      where: whereClause,
      limit: parseInt(limit),
      offset: parseInt(offset),
      order: [['createdAt', 'DESC']]
    });

    const totalPages = Math.ceil(categories.count / limit);

    res.status(200).json({
      success: true,
      message: 'Categories retrieved successfully',
      data: {
        categories: categories.rows,
        pagination: {
          currentPage: parseInt(page),
          totalPages,
          totalItems: categories.count,
          itemsPerPage: parseInt(limit)
        }
      }
    });
  } catch (error) {
    next(error);
  }
};

// Get category by ID
const getCategoryById = async (req, res, next) => {
  try {
    const { id } = req.params;
    
    const category = await Category.findOne({ 
      where: { id }
    });
    
    if (!category) {
      return next(createError(404, 'Category not found'));
    }

    res.status(200).json({
      success: true,
      message: 'Category retrieved successfully',
      data: { category }
    });
  } catch (error) {
    next(error);
  }
};

// Update category
const updateCategory = async (req, res, next) => {
  try {
    const { id } = req.params;

    // Only admin can update categories
    if (!req.user || req.user.role !== 'admin') {
      return next(createError(403, 'Only admin can update categories'));
    }

    const { name, status } = req.body;

    const category = await Category.findOne({ where: { id } });
    if (!category) {
      return next(createError(404, 'Category not found'));
    }

    // Check if name is being updated and if it already exists
    if (name && name.trim() !== category.name) {
      const existingCategory = await Category.findOne({ 
        where: { 
          name: name.trim(),
          id: { [Op.ne]: id } // Exclude current category
        } 
      });
      
      if (existingCategory) {
        return next(createError(400, 'Category name already exists'));
      }
    }

    // Update category
    const updateData = {};
    if (name !== undefined) updateData.name = name.trim();
    if (status !== undefined) updateData.status = status;

    await category.update(updateData);

    logger.info(`Category updated: ${category.name}`);

    res.status(200).json({
      success: true,
      message: 'Category updated successfully',
      data: { category }
    });
  } catch (error) {
    next(error);
  }
};

// Delete category
const deleteCategory = async (req, res, next) => {
  try {
    const { id } = req.params;

    // Only admin can delete categories
    if (!req.user || req.user.role !== 'admin') {
      return next(createError(403, 'Only admin can delete categories'));
    }

    const category = await Category.findOne({ where: { id } });
    if (!category) {
      return next(createError(404, 'Category not found'));
    }

    await category.destroy();

    logger.info(`Category deleted: ${category.name}`);

    res.status(200).json({
      success: true,
      message: 'Category deleted successfully'
    });
  } catch (error) {
    next(error);
  }
};

// Update category status
const updateCategoryStatus = async (req, res, next) => {
  try {
    const { id } = req.params;

    // Only admin can update category status
    if (!req.user || req.user.role !== 'admin') {
      return next(createError(403, 'Only admin can update category status'));
    }

    const { status } = req.body;

    if (!status || !['active', 'inactive'].includes(status)) {
      return next(createError(400, 'Status must be active or inactive'));
    }

    const category = await Category.findOne({ where: { id } });
    if (!category) {
      return next(createError(404, 'Category not found'));
    }

    // Update status
    await category.update({ status });

    logger.info(`Category status updated: ${category.name} - ${status}`);

    // Send Firebase notification when category becomes active
    if (status === 'active') {
      try {
        const customers = await User.findAll({ 
          where: { role: 'customer', isBlocked: false },
          attributes: ['fcmToken']
        });
        const customerTokens = customers.map(c => c.fcmToken).filter(token => token);
        
        if (customerTokens.length > 0) {
          await notificationService.sendToMultipleDevices(
            customerTokens,
            'Category Now Available! ✅',
            `"${category.name}" category is now active. Explore products!`,
            { type: 'CATEGORY_ACTIVATED', categoryId: category.id, categoryName: category.name },
            {
              recipientType: 'multiple',
              notificationType: 'CUSTOM'
            }
          );
        }
      } catch (notifError) {
        logger.error('Error sending category status notification:', notifError.message);
      }
    }

    res.status(200).json({
      success: true,
      message: 'Category status updated successfully',
      data: { category }
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  createCategory,
  getAllCategories,
  getCategoryById,
  updateCategory,
  deleteCategory,
  updateCategoryStatus
};
