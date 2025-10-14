const Joi = require('joi');

const createDeliveryCharge = Joi.object({
  agencyId: Joi.string()
    .uuid()
    .required()
    .messages({
      'string.empty': 'Agency ID is required',
      'string.guid': 'Invalid agency ID format',
      'any.required': 'Agency ID is required'
    }),
  chargeType: Joi.string()
    .valid('per_km', 'fixed')
    .required()
    .messages({
      'string.empty': 'Charge type is required',
      'any.only': 'Charge type must be per_km or fixed',
      'any.required': 'Charge type is required'
    }),
  ratePerKm: Joi.number()
    .min(0)
    .when('chargeType', {
      is: 'per_km',
      then: Joi.required(),
      otherwise: Joi.forbidden()
    })
    .messages({
      'number.base': 'Rate per kilometer must be a number',
      'number.min': 'Rate per kilometer must be at least 0',
      'any.required': 'Rate per kilometer is required for per_km charge type',
      'any.unknown': 'Rate per kilometer should not be provided for fixed charge type'
    }),
  fixedAmount: Joi.number()
    .min(0)
    .when('chargeType', {
      is: 'fixed',
      then: Joi.required(),
      otherwise: Joi.forbidden()
    })
    .messages({
      'number.base': 'Fixed amount must be a number',
      'number.min': 'Fixed amount must be at least 0',
      'any.required': 'Fixed amount is required for fixed charge type',
      'any.unknown': 'Fixed amount should not be provided for per_km charge type'
    }),
  deliveryRadius: Joi.number()
    .min(1)
    .required()
    .messages({
      'number.base': 'Delivery radius must be a number',
      'number.min': 'Delivery radius must be at least 1 km',
      'any.required': 'Delivery radius is required'
    }),
  status: Joi.string()
    .valid('active', 'inactive')
    .default('active')
    .messages({
      'any.only': 'Status must be either active or inactive'
    })
});

const updateDeliveryCharge = Joi.object({
  chargeType: Joi.string()
    .valid('per_km', 'fixed')
    .messages({
      'any.only': 'Charge type must be per_km or fixed'
    }),
  ratePerKm: Joi.number()
    .min(0)
    .when('chargeType', {
      is: 'per_km',
      then: Joi.required(),
      otherwise: Joi.forbidden()
    })
    .messages({
      'number.base': 'Rate per kilometer must be a number',
      'number.min': 'Rate per kilometer must be at least 0',
      'any.required': 'Rate per kilometer is required for per_km charge type'
    }),
  fixedAmount: Joi.number()
    .min(0)
    .when('chargeType', {
      is: 'fixed',
      then: Joi.required(),
      otherwise: Joi.forbidden()
    })
    .messages({
      'number.base': 'Fixed amount must be a number',
      'number.min': 'Fixed amount must be at least 0',
      'any.required': 'Fixed amount is required for fixed charge type'
    }),
  deliveryRadius: Joi.number()
    .min(1)
    .messages({
      'number.base': 'Delivery radius must be a number',
      'number.min': 'Delivery radius must be at least 1 km'
    }),
  status: Joi.string()
    .valid('active', 'inactive')
    .messages({
      'any.only': 'Status must be either active or inactive'
    })
}).min(1).messages({
  'object.min': 'At least one field is required for update'
});

const calculateCharge = Joi.object({
  customerId: Joi.string()
    .uuid()
    .required()
    .messages({
      'string.empty': 'Customer ID is required',
      'string.guid': 'Invalid customer ID format',
      'any.required': 'Customer ID is required'
    }),
  agencyId: Joi.string()
    .uuid()
    .required()
    .messages({
      'string.empty': 'Agency ID is required',
      'string.guid': 'Invalid agency ID format',
      'any.required': 'Agency ID is required'
    }),
  addressId: Joi.string()
    .required()
    .messages({
      'string.empty': 'Address ID is required',
      'any.required': 'Address ID is required'
    })
});

module.exports = {
  createDeliveryCharge,
  updateDeliveryCharge,
  calculateCharge
};

