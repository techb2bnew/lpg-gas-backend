const Joi = require('joi');

const createAgency = Joi.object({
  name: Joi.string().min(2).max(150).required(),
  email: Joi.string().email().required(),
  phone: Joi.string().pattern(/^[0-9]{10,15}$/).required(),
  addressTitle: Joi.string().min(2).max(50).required(),
  address: Joi.string().min(5).max(500).required(),
  city: Joi.string().min(2).max(50).required(),
  pincode: Joi.string().pattern(/^[0-9]{6}$/).required(),
  landmark: Joi.string().max(100).optional().allow(''),
  profileImage: Joi.string().uri().optional().allow('')
});

const updateAgency = Joi.object({
  name: Joi.string().min(2).max(150).optional(),
  email: Joi.string().email().optional(),
  phone: Joi.string().pattern(/^[0-9]{10,15}$/).optional(),
  addressTitle: Joi.string().min(2).max(50).optional(),
  address: Joi.string().min(5).max(500).optional(),
  city: Joi.string().min(2).max(50).optional(),
  pincode: Joi.string().pattern(/^[0-9]{6}$/).optional(),
  landmark: Joi.string().max(100).optional().allow(''),
  profileImage: Joi.string().uri().optional().allow(''),
  status: Joi.string().valid('inactive', 'active').optional()
});

module.exports = {
  createAgency,
  updateAgency
};


