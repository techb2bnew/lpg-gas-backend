const Joi = require('joi');

// Shared schemas
const variantSchema = Joi.object({
  label: Joi.alternatives().try(
    Joi.string().min(1).max(50),
    Joi.number(),
    Joi.boolean()
  ).optional(),
  value: Joi.alternatives().try(
    Joi.string().min(1).max(50),
    Joi.number(),
    Joi.boolean()
  ).optional(),
  unit: Joi.string().min(1).max(20).optional(),
  price: Joi.number().positive().precision(2).required(),
  stock: Joi.number().integer().min(0).default(0)
}).custom((value, helpers) => {
  // Ensure either label or value is provided
  if (!value.label && !value.value) {
    return helpers.error('any.custom', { message: 'Either label or value is required' });
  }
  
  // Convert both label and value to strings for consistency
  if (value.label !== undefined) {
    value.label = String(value.label);
  }
  if (value.value !== undefined) {
    value.value = String(value.value);
  }
  
  // If both are provided, use label as primary
  if (value.label && value.value) {
    value.label = value.label;
  } else if (value.value && !value.label) {
    value.label = value.value;
  }
  return value;
});


// Validation for creating a product
const createProduct = Joi.object({
  productName: Joi.string().min(2).max(200).required().messages({
    'string.min': 'Product name must be at least 2 characters long',
    'string.max': 'Product name cannot exceed 200 characters',
    'any.required': 'Product name is required'
  }),
  unit: Joi.string().min(1).max(50).optional().messages({
    'string.min': 'Unit must be at least 1 character long',
    'string.max': 'Unit cannot exceed 50 characters'
  }),
  description: Joi.string().min(3).max(2000).required().messages({
    'string.min': 'Description must be at least 3 characters long',
    'string.max': 'Description cannot exceed 2000 characters',
    'any.required': 'Description is required'
  }),
  price: Joi.number().positive().precision(2).optional().messages({
    'number.base': 'Price must be a valid number',
    'number.positive': 'Price must be positive',
  }),
  // Removed stock - agencies will manage their own stock
  lowStockThreshold: Joi.number().integer().min(0).default(10).messages({
    'number.base': 'Low stock threshold must be a valid number',
    'number.integer': 'Low stock threshold must be a whole number',
    'number.min': 'Low stock threshold cannot be negative'
  }),
  category: Joi.string().min(2).max(100).default('lpg').messages({
    'string.min': 'Category must be at least 2 characters long',
    'string.max': 'Category cannot exceed 100 characters'
  }),
  status: Joi.string().valid('active', 'inactive').default('active').messages({
    'any.only': 'Status must be either active or inactive'
  }),
  variants: Joi.array().items(variantSchema).min(1).required().messages({
    'array.base': 'Variants must be an array',
    'array.min': 'At least one variant is required'
  }),
  images: Joi.array().items(Joi.string().min(1)).optional(),
  tags: Joi.array().items(Joi.string().min(1).max(50)).optional().messages({
    'array.base': 'Tags must be an array',
    'string.min': 'Each tag must be at least 1 character long',
    'string.max': 'Each tag cannot exceed 50 characters'
  })
  // Removed agencyId - products are now admin-managed
});

// Validation for updating a product
const updateProduct = Joi.object({
  productName: Joi.string().min(2).max(200).optional().messages({
    'string.min': 'Product name must be at least 2 characters long',
    'string.max': 'Product name cannot exceed 200 characters'
  }),
  unit: Joi.string().min(1).max(50).optional().messages({
    'string.min': 'Unit must be at least 1 character long',
    'string.max': 'Unit cannot exceed 50 characters'
  }),
  description: Joi.string().min(3).max(2000).optional().messages({
    'string.min': 'Description must be at least 3 characters long',
    'string.max': 'Description cannot exceed 2000 characters'
  }),
  price: Joi.number().positive().precision(2).optional().messages({
    'number.base': 'Price must be a valid number',
    'number.positive': 'Price must be positive'
  }),
  // Removed stock - agencies will manage their own stock
  lowStockThreshold: Joi.number().integer().min(0).optional().messages({
    'number.base': 'Low stock threshold must be a valid number',
    'number.integer': 'Low stock threshold must be a whole number',
    'number.min': 'Low stock threshold cannot be negative'
  }),
  category: Joi.string().min(2).max(100).optional().messages({
    'string.min': 'Category must be at least 2 characters long',
    'string.max': 'Category cannot exceed 100 characters'
  }),
  status: Joi.string().valid('active', 'inactive').optional().messages({
    'any.only': 'Status must be either active or inactive'
  }),
  variants: Joi.array().items(variantSchema).min(1).optional(),
  images: Joi.array().items(Joi.string().min(1)).optional(),
  imagesToDelete: Joi.array().items(Joi.string().min(1)).optional(),
  existingImages: Joi.array().items(Joi.string().min(1)).optional(),
  tags: Joi.array().items(Joi.string().min(1).max(50)).optional().messages({
    'array.base': 'Tags must be an array',
    'string.min': 'Each tag must be at least 1 character long',
    'string.max': 'Each tag cannot exceed 50 characters'
  })
  // Removed agencyId - products are now admin-managed
}).unknown(true);

// Validation for updating status only
const updateStatus = Joi.object({
  status: Joi.string().valid('active', 'inactive').required().messages({
    'any.only': 'Status must be either active or inactive',
    'any.required': 'Status is required'
  })
});

// Validation for agency inventory management
const agencyInventorySchema = Joi.object({
  stock: Joi.number().integer().min(0).optional().messages({
    'number.base': 'Stock must be a valid number',
    'number.integer': 'Stock must be a whole number',
    'number.min': 'Stock cannot be negative'
  }),
  lowStockThreshold: Joi.number().integer().min(0).optional().messages({
    'number.base': 'Low stock threshold must be a valid number',
    'number.integer': 'Low stock threshold must be a whole number',
    'number.min': 'Low stock threshold cannot be negative'
  }),
  agencyPrice: Joi.number().positive().precision(2).optional().messages({
    'number.base': 'Agency price must be a valid number',
    'number.positive': 'Agency price must be positive'
  }),
  agencyVariants: Joi.array().items(variantSchema).optional().messages({
    'array.base': 'Agency variants must be an array'
  }),
  isActive: Joi.boolean().optional().messages({
    'boolean.base': 'isActive must be a boolean value'
  })
});

module.exports = {
  createProduct,
  updateProduct,
  updateStatus,
  agencyInventorySchema
};
