const Joi = require('joi');

exports.addOrUpdateTaxSchema = Joi.object({
  percentage: Joi.number()
    .min(0)
    .max(100)
    .allow(null)
    .optional()
    .messages({
      'number.min': 'Percentage must be at least 0',
      'number.max': 'Percentage cannot exceed 100',
    }),
  fixedAmount: Joi.number()
    .min(0)
    .allow(null)
    .optional()
    .messages({
      'number.min': 'Fixed amount must be at least 0',
    }),
});

exports.calculateTaxSchema = Joi.object({
  amount: Joi.number()
    .positive()
    .required()
    .messages({
      'number.base': 'Amount must be a number',
      'number.positive': 'Amount must be positive',
      'any.required': 'Amount is required',
    }),
});
