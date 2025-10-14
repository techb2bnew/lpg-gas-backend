const Joi = require('joi');

// Validation for adding a single address
const addAddress = Joi.object({
  id: Joi.string().optional().messages({
    'string.base': 'Address ID must be a string'
  }),
  title: Joi.string().min(2).max(50).required().messages({
    'string.min': 'Address title must be at least 2 characters',
    'string.max': 'Address title cannot exceed 50 characters',
    'any.required': 'Address title is required'
  }),
  address: Joi.string().min(5).max(500).required().messages({
    'string.min': 'Address must be at least 5 characters',
    'string.max': 'Address cannot exceed 500 characters',
    'any.required': 'Address is required'
  }),
  city: Joi.string().min(2).max(50).required().messages({
    'string.min': 'City must be at least 2 characters',
    'string.max': 'City cannot exceed 50 characters',
    'any.required': 'City is required'
  }),
  pincode: Joi.string().pattern(/^[0-9]{6}$/).required().messages({
    'string.pattern.base': 'PIN code must be 6 digits',
    'any.required': 'PIN code is required'
  }),
  landmark: Joi.string().max(100).optional().allow('').messages({
    'string.max': 'Landmark cannot exceed 100 characters'
  })
});

// Validation for updating an address
const updateAddress = Joi.object({
  id: Joi.string().optional().messages({
    'string.base': 'Address ID must be a string'
  }),
  title: Joi.string().min(2).max(50).optional().messages({
    'string.min': 'Address title must be at least 2 characters',
    'string.max': 'Address title cannot exceed 50 characters'
  }),
  address: Joi.string().min(5).max(500).optional().messages({
    'string.min': 'Address must be at least 5 characters',
    'string.max': 'Address cannot exceed 500 characters'
  }),
  city: Joi.string().min(2).max(50).optional().messages({
    'string.min': 'City must be at least 2 characters',
    'string.max': 'City cannot exceed 50 characters'
  }),
  pincode: Joi.string().pattern(/^[0-9]{6}$/).optional().messages({
    'string.pattern.base': 'PIN code must be 6 digits'
  }),
  landmark: Joi.string().max(100).optional().allow('').messages({
    'string.max': 'Landmark cannot exceed 100 characters'
  })
});

module.exports = {
  addAddress,
  updateAddress
};
