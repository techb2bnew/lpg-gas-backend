const Joi = require('joi');

// Validation for creating Privacy Policy
const createPrivacyPolicy = Joi.object({
  title: Joi.string().min(2).max(200).required().messages({
    'string.min': 'Title must be at least 2 characters long',
    'string.max': 'Title cannot exceed 200 characters',
    'any.required': 'Title is required'
  }),
  description: Joi.string().min(10).max(10000).required().messages({
    'string.min': 'Description must be at least 10 characters long',
    'string.max': 'Description cannot exceed 10000 characters',
    'any.required': 'Description is required'
  }),
  status: Joi.string().valid('active', 'inactive').default('active').messages({
    'any.only': 'Status must be either active or inactive'
  }),
  version: Joi.string().min(1).max(20).default('1.0').messages({
    'string.min': 'Version must be at least 1 character long',
    'string.max': 'Version cannot exceed 20 characters'
  })
});

// Validation for updating Privacy Policy
const updatePrivacyPolicy = Joi.object({
  title: Joi.string().min(2).max(200).optional().messages({
    'string.min': 'Title must be at least 2 characters long',
    'string.max': 'Title cannot exceed 200 characters'
  }),
  description: Joi.string().min(10).max(10000).optional().messages({
    'string.min': 'Description must be at least 10 characters long',
    'string.max': 'Description cannot exceed 10000 characters'
  }),
  status: Joi.string().valid('active', 'inactive').optional().messages({
    'any.only': 'Status must be either active or inactive'
  }),
  version: Joi.string().min(1).max(20).optional().messages({
    'string.min': 'Version must be at least 1 character long',
    'string.max': 'Version cannot exceed 20 characters'
  })
}).unknown(true);

// Validation for updating status only
const updateStatus = Joi.object({
  status: Joi.string().valid('active', 'inactive').required().messages({
    'any.only': 'Status must be either active or inactive',
    'any.required': 'Status is required'
  })
});

module.exports = {
  createPrivacyPolicy,
  updatePrivacyPolicy,
  updateStatus
};
