const Joi = require('joi');

// Validation for login
const validateLogin = Joi.object({
  email: Joi.string().email().required().messages({
    'string.email': 'Please provide a valid email address',
    'any.required': 'Email is required'
  }),
  password: Joi.string().min(6).required().messages({
    'string.min': 'Password must be at least 6 characters long',
    'any.required': 'Password is required'
  }),
  fcmToken: Joi.string().optional().allow('', null),
  fcmDeviceType: Joi.string().optional().allow('', null)
});

// Validation for customer profile completion
const validateCustomerProfile = Joi.object({
  name: Joi.string().min(2).max(100).required().messages({
    'string.min': 'Name must be at least 2 characters long',
    'string.max': 'Name cannot exceed 100 characters',
    'any.required': 'Name is required'
  }),
  phone: Joi.string().pattern(/^[0-9]{10,15}$/).required().messages({
    'string.pattern.base': 'Phone number must be 10-15 digits',
    'any.required': 'Phone number is required'
  }),
  address: Joi.string().min(10).max(500).required().messages({
    'string.min': 'Address must be at least 10 characters',
    'string.max': 'Address cannot exceed 500 characters',
    'any.required': 'Address is required'
  })
});

// Validation for agent profile completion
const validateAgentProfile = Joi.object({
  name: Joi.string().min(2).max(100).required().messages({
    'string.min': 'Name must be at least 2 characters long',
    'string.max': 'Name cannot exceed 100 characters',
    'any.required': 'Name is required'
  }),
  phone: Joi.string().pattern(/^[0-9]{10,15}$/).required().messages({
    'string.pattern.base': 'Phone number must be 10-15 digits',
    'any.required': 'Phone number is required'
  }),
  address: Joi.string().min(10).max(500).required().messages({
    'string.min': 'Address must be at least 10 characters',
    'string.max': 'Address cannot exceed 500 characters',
    'any.required': 'Address is required'
  })
});

// Validation for setup user (admin)
const validateSetupUser = Joi.object({
  email: Joi.string().email().required().messages({
    'string.email': 'Please provide a valid email address',
    'any.required': 'Email is required'
  }),
  password: Joi.string().min(6).max(100).required().messages({
    'string.min': 'Password must be at least 6 characters long',
    'string.max': 'Password cannot exceed 100 characters',
    'any.required': 'Password is required'
  })
});

// Validation for updating profile
const validateUpdateProfile = Joi.object({
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
  address: Joi.string().min(10).max(500).optional().messages({
    'string.min': 'Address must be at least 10 characters',
    'string.max': 'Address cannot exceed 500 characters'
  }),
  addresses: Joi.alternatives().try(
    Joi.array().items(
      Joi.object({
        id: Joi.string().optional(), // Allow id field
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
      }).unknown(true) // Allow additional fields
    ),
    Joi.string() // Allow string for form-data parsing
  ).optional().messages({
    'alternatives.match': 'Addresses must be an array or valid JSON string'
  }),
  role: Joi.string().valid('admin', 'customer', 'agent', 'agency_owner').optional().messages({
    'any.only': 'Role must be admin, customer, agent, or agency_owner'
  })
});

// Validation for requesting OTP
const validateRequestOTP = Joi.object({
  email: Joi.string().email().required().messages({
    'string.email': 'Please provide a valid email address',
    'any.required': 'Email is required'
  }),
  role: Joi.string().valid('customer', 'agent').required().messages({
    'any.only': 'Role must be customer or agent',
    'any.required': 'Role is required'
  }),
  fcmToken: Joi.string().optional().allow('', null),
  fcmDeviceType: Joi.string().optional().allow('', null)
});

// Validation for verifying OTP
const validateVerifyOTP = Joi.object({
  email: Joi.string().email().required().messages({
    'string.email': 'Please provide a valid email address',
    'any.required': 'Email is required'
  }),
  otp: Joi.string().pattern(/^[0-9]{6}$/).required().messages({
    'string.pattern.base': 'OTP must be 6 digits',
    'any.required': 'OTP is required'
  }),
  role: Joi.string().valid('customer', 'agent').required().messages({
    'any.only': 'Role must be customer or agent',
    'any.required': 'Role is required'
  }),
  fcmToken: Joi.string().optional().allow('', null),
  fcmDeviceType: Joi.string().optional().allow('', null)
});

// Validation for agency owner initial password set
const validateAgencyOwnerInitialPassword = Joi.object({
  email: Joi.string().email().required().messages({
    'string.email': 'Please provide a valid email address',
    'any.required': 'Email is required'
  }),
  password: Joi.string().min(6).max(100).required().messages({
    'string.min': 'Password must be at least 6 characters long',
    'string.max': 'Password cannot exceed 100 characters',
    'any.required': 'Password is required'
  }),
  confirmPassword: Joi.any().valid(Joi.ref('password')).required().messages({
    'any.only': 'Passwords do not match',
    'any.required': 'Confirm password is required'
  })
});

// Validation for admin forgot password request
const validateForgotPasswordRequest = Joi.object({
  email: Joi.string().email().required().messages({
    'string.email': 'Please provide a valid email address',
    'any.required': 'Email is required'
  })
});

// Validation for admin reset password using OTP
const validateResetPassword = Joi.object({
  email: Joi.string().email().required().messages({
    'string.email': 'Please provide a valid email address',
    'any.required': 'Email is required'
  }),
  otp: Joi.string().pattern(/^[0-9]{6}$/).required().messages({
    'string.pattern.base': 'OTP must be 6 digits',
    'any.required': 'OTP is required'
  }),
  newPassword: Joi.string().min(6).max(100).required().messages({
    'string.min': 'Password must be at least 6 characters long',
    'string.max': 'Password cannot exceed 100 characters',
    'any.required': 'New password is required'
  }),
  confirmPassword: Joi.any().valid(Joi.ref('newPassword')).required().messages({
    'any.only': 'Passwords do not match',
    'any.required': 'Confirm password is required'
  })
});

// Validation for deleting account
const validateDeleteAccount = Joi.object({
  confirmation: Joi.string().valid('DELETE_MY_ACCOUNT').required().messages({
    'any.only': 'Confirmation must be exactly "DELETE_MY_ACCOUNT"',
    'any.required': 'Confirmation is required for account deletion'
  })
});

module.exports = {
  validateLogin,
  validateCustomerProfile,
  validateAgentProfile,
  validateSetupUser,
  validateUpdateProfile,
  validateRequestOTP,
  validateVerifyOTP,
  validateDeleteAccount,
  validateForgotPasswordRequest,
  validateResetPassword,
  validateAgencyOwnerInitialPassword
};
