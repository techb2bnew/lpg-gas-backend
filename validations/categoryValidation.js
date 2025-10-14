const Joi = require('joi');

// Validation for creating a category
const createCategory = Joi.object({
  name: Joi.string()
    .min(2)
    .max(100)
    .required()
    .messages({
      'string.min': 'Category name must be at least 2 characters long',
      'string.max': 'Category name cannot exceed 100 characters',
      'any.required': 'Category name is required'
    })
});

// Validation for updating a category
const updateCategory = Joi.object({
  name: Joi.string()
    .min(2)
    .max(100)
    .optional()
    .messages({
      'string.min': 'Category name must be at least 2 characters long',
      'string.max': 'Category name cannot exceed 100 characters'
    }),
  status: Joi.string()
    .valid('active', 'inactive')
    .optional()
    .messages({
      'any.only': 'Status must be either active or inactive'
    })
}).min(1).messages({
  'object.min': 'At least one field must be provided for update'
});

// Validation for updating category status only
const updateStatus = Joi.object({
  status: Joi.string()
    .valid('active', 'inactive')
    .required()
    .messages({
      'any.only': 'Status must be either active or inactive',
      'any.required': 'Status is required'
    })
});

module.exports = {
  createCategory,
  updateCategory,
  updateStatus
};
