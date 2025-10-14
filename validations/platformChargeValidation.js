const Joi = require('joi');

exports.addOrUpdatePlatformChargeSchema = Joi.object({
  amount: Joi.number()
    .min(0)
    .required()
    .messages({
      'number.base': 'Amount must be a number',
      'number.min': 'Amount must be at least 0',
      'any.required': 'Amount is required',
    }),
});
