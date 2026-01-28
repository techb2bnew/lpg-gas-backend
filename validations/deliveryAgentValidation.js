const Joi = require('joi');

// Validation for creating a delivery agent
const createDeliveryAgent = Joi.object({
  name: Joi.string().min(2).max(100).required().messages({
    'string.min': 'Name must be at least 2 characters long',
    'string.max': 'Name cannot exceed 100 characters',
    'any.required': 'Name is required'
  }),
  email: Joi.string().email().required().messages({
    'string.email': 'Please provide a valid email address',
    'any.required': 'Email is required'
  }),
  phone: Joi.string().pattern(/^[0-9]{10,15}$/).required().messages({
    'string.pattern.base': 'Phone number must be 10-15 digits',
    'any.required': 'Phone number is required'
  }),
  vehicleNumber: Joi.string().min(5).max(20).required().messages({
    'string.min': 'Vehicle number must be at least 5 characters',
    'string.max': 'Vehicle number cannot exceed 20 characters',
    'any.required': 'Vehicle number is required'
  }),
  drivingLicence: Joi.string().min(10).max(20).required().messages({
    'string.min': 'Driving licence must be at least 10 characters',
    'string.max': 'Driving licence cannot exceed 20 characters',
    'any.required': 'Driving licence is required'
  }),
  bankDetails: Joi.string().min(10).required().messages({
    'string.min': 'Bank details must be at least 10 characters',
    'any.required': 'Bank details are required'
  }),
  status: Joi.string().valid('online', 'offline').default('offline').messages({
    'any.only': 'Status must be either online or offline'
  }),
  joinedAt: Joi.date().optional().messages({
    'date.base': 'Joined date must be a valid date'
  }),
  // Allow clearing the image by sending empty string or null (with whitespace trimmed)
  profileImage: Joi.string().trim().allow('', null).optional().messages({
    'string.base': 'Profile image must be a string'
  }),
  agencyId: Joi.string().uuid().optional().messages({
    'string.guid': 'Agency ID must be a valid UUID'
  })
});

// Validation for updating a delivery agent
const updateDeliveryAgent = Joi.object({
  name: Joi.string().min(2).max(100).optional().messages({
    'string.min': 'Name must be at least 2 characters long',
    'string.max': 'Name cannot exceed 100 characters'
  }),
  email: Joi.string().email().optional().messages({
    'string.email': 'Please provide a valid email address'
  }),
  phone: Joi.string().pattern(/^[0-9]{10,15}$/).optional().messages({
    'string.pattern.base': 'Phone number must be 10-15 digits'
  }),
  vehicleNumber: Joi.string().min(5).max(20).optional().messages({
    'string.min': 'Vehicle number must be at least 5 characters',
    'string.max': 'Vehicle number cannot exceed 20 characters'
  }),
  drivingLicence: Joi.string().min(10).max(20).optional().messages({
    'string.min': 'Driving licence must be at least 10 characters',
    'string.max': 'Driving licence cannot exceed 20 characters'
  }),
  bankDetails: Joi.string().min(10).optional().messages({
    'string.min': 'Bank details must be at least 10 characters'
  }),
  status: Joi.string().valid('online', 'offline').optional().messages({
    'any.only': 'Status must be either online or offline'
  }),
  joinedAt: Joi.date().optional().messages({
    'date.base': 'Joined date must be a valid date'
  }),
  profileImage: Joi.string().allow('', null).optional().messages({
    'string.base': 'Profile image must be a string'
  }),
  agencyId: Joi.string().uuid().optional().messages({
    'string.guid': 'Agency ID must be a valid UUID'
  })
}).unknown(true); // Allow unknown fields like createdAt, updatedAt, id

// Validation for updating status only
const updateStatus = Joi.object({
  status: Joi.string().valid('online', 'offline').required().messages({
    'any.only': 'Status must be either online or offline',
    'any.required': 'Status is required'
  })
});

// Validation for comprehensive agent profile update (by agent themselves)
const updateAgentProfileComprehensive = Joi.object({
  // Basic profile fields
  name: Joi.string().min(2).max(100).optional().messages({
    'string.min': 'Name must be at least 2 characters long',
    'string.max': 'Name cannot exceed 100 characters'
  }),
  phone: Joi.string().pattern(/^[0-9]{10,15}$/).optional().messages({
    'string.pattern.base': 'Phone number must be 10-15 digits'
  }),
  address: Joi.string().min(10).optional().messages({
    'string.min': 'Address must be at least 10 characters'
  }),
  addresses: Joi.array().items(
    Joi.object({
      type: Joi.string().valid('home', 'work', 'other').required(),
      address: Joi.string().min(10).required(),
      landmark: Joi.string().optional(),
      pincode: Joi.string().pattern(/^[0-9]{6}$/).required()
    })
  ).optional(),
  
  // Delivery agent specific fields (with restrictions)
  vehicleNumber: Joi.string().min(5).max(20).optional().messages({
    'string.min': 'Vehicle number must be at least 5 characters',
    'string.max': 'Vehicle number cannot exceed 20 characters'
  }),
  drivingLicence: Joi.string().min(10).max(20).optional().messages({
    'string.min': 'Driving licence must be at least 10 characters',
    'string.max': 'Driving licence cannot exceed 20 characters'
  }),
  bankDetails: Joi.string().min(10).optional().messages({
    'string.min': 'Bank details must be at least 10 characters'
  }),
  
  // Status can only be updated by agent (online/offline)
  status: Joi.string().valid('online', 'offline').optional().messages({
    'any.only': 'Status must be either online or offline'
  })
}).unknown(true); // Allow unknown fields

module.exports = {
  createDeliveryAgent,
  updateDeliveryAgent,
  updateStatus,
  updateAgentProfileComprehensive
};
