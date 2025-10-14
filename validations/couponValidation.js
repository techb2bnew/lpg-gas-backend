const Joi = require('joi');

exports.addCouponSchema = Joi.object({
  code: Joi.string()
    .min(3)
    .max(50)
    .required()
    .messages({
      'string.min': 'Coupon code must be at least 3 characters',
      'string.max': 'Coupon code cannot exceed 50 characters',
      'any.required': 'Coupon code is required',
    }),
  discountType: Joi.string()
    .valid('percentage', 'fixed')
    .required()
    .messages({
      'any.only': 'Discount type must be either percentage or fixed',
      'any.required': 'Discount type is required',
    }),
  discountValue: Joi.number()
    .positive()
    .required()
    .messages({
      'number.positive': 'Discount value must be positive',
      'any.required': 'Discount value is required',
    }),
  minAmount: Joi.number()
    .min(0)
    .required()
    .messages({
      'number.min': 'Minimum amount must be at least 0',
      'any.required': 'Minimum amount is required',
    }),
  maxAmount: Joi.number()
    .min(0)
    .optional()
    .allow(null)
    .messages({
      'number.min': 'Maximum amount must be at least 0',
    }),
  expiryDate: Joi.date()
    .required()
    .messages({
      'any.required': 'Expiry date is required',
    }),
  expiryTime: Joi.string()
    .required()
    .messages({
      'any.required': 'Expiry time is required',
    }),
  agencyId: Joi.string()
    .uuid()
    .optional()
    .messages({
      'string.guid': 'Agency ID must be a valid UUID',
    }),
});

exports.updateCouponSchema = Joi.object({
  code: Joi.string()
    .min(3)
    .max(50)
    .optional(),
  discountType: Joi.string()
    .valid('percentage', 'fixed')
    .optional(),
  discountValue: Joi.number()
    .positive()
    .optional(),
  minAmount: Joi.number()
    .min(0)
    .optional(),
  maxAmount: Joi.number()
    .min(0)
    .optional()
    .allow(null),
  expiryDate: Joi.date()
    .optional(),
  expiryTime: Joi.string()
    .optional(),
  isActive: Joi.boolean()
    .optional(),
});

exports.toggleCouponStatusSchema = Joi.object({
  isActive: Joi.boolean()
    .required()
    .messages({
      'boolean.base': 'isActive must be a boolean value',
      'any.required': 'isActive is required',
    }),
});

exports.applyCouponSchema = Joi.object({
  code: Joi.string()
    .required()
    .messages({
      'any.required': 'Coupon code is required',
    }),
  amount: Joi.number()
    .positive()
    .required()
    .messages({
      'number.positive': 'Amount must be positive',
      'any.required': 'Amount is required',
    }),
  agencyId: Joi.string()
    .uuid()
    .required()
    .messages({
      'string.guid': 'Agency ID must be a valid UUID',
      'any.required': 'Agency ID is required',
    }),
});
