const jwt = require('jsonwebtoken');
const { User, DeliveryAgent, LoginOTP, AgencyOwner } = require('../models');
const { 
  validateLogin, 
  validateSetupUser, 
  validateCustomerProfile, 
  validateAgentProfile,
  validateUpdateProfile,
  validateRequestOTP,
  validateVerifyOTP,
  validateDeleteAccount,
  validateForgotPasswordRequest,
  validateResetPassword,
  validateAgencyOwnerInitialPassword
} = require('../validations/authValidation');
const { updateAgentProfileComprehensive } = require('../validations/deliveryAgentValidation');
const { createError } = require('../utils/errorHandler');
const logger = require('../utils/logger');
const fs = require('fs');
const path = require('path');
const { Op } = require('sequelize');

// Get socket service instance
const getSocketService = () => {
  return global.socketService;
};

// Generate JWT token
const generateToken = (userId, role, additionalData = {}) => {
  const jwtSecret = process.env.JWT_SECRET;
  
  if (!jwtSecret) {
    throw new Error('JWT_SECRET is not configured. Please check your .env file.');
  }
  
  return jwt.sign(
    { 
      userId, 
      role,
      ...additionalData
    },
    jwtSecret,
    { expiresIn: process.env.JWT_EXPIRES_IN || '24h' }
  );
};

// Login user (Admin, Customer, Agent, Agency Owner)
const login = async (req, res, next) => {
  try {
    // Validate input
    const { error } = validateLogin.validate(req.body);
    if (error) {
      return next(createError(400, error.details[0].message));
    }

    const { email, password } = req.body;
    const trimmedEmail = email.trim();
    const emailWhereClause = { [Op.iLike]: trimmedEmail };

    console.log('🔍 LOGIN DEBUG:', { email, passwordLength: password.length });

    // First try to find in User table (Admin, Customer, Agent)
    let user = await User.findOne({
      where: { email: emailWhereClause }
    });

    console.log('👤 User found in User table:', !!user);

    let userType = 'user';
    let userData = null;
    let agencyOwnerRecord = null;

    if (user) {
      console.log('🔐 User found - checking password...');
      // Verify password for User
      const isPasswordValid = await user.comparePassword(password);
      console.log('✅ User password valid:', isPasswordValid);
      if (!isPasswordValid) {
        console.log('❌ User password invalid');
        return next(createError(401, 'Invalid email or password'));
      }

      // Blocked user cannot login
      if (user.isBlocked) {
        logger.warn(`Blocked user attempted login: ${email}`);
        return next(createError(403, 'Your account is blocked by admin please contact.'));
      }

      userType = user.role;
      userData = user.toPublicJSON();
    } else {
      console.log('👤 User not found in User table, checking AgencyOwner...');
      // If not found in User table, try AgencyOwner table
      const agencyOwner = await AgencyOwner.findOne({
        where: { email: emailWhereClause }
      });
      agencyOwnerRecord = agencyOwner;

      console.log('🏢 AgencyOwner found:', !!agencyOwner);
      if (agencyOwner) {
        console.log('🔐 AgencyOwner found - checking details...');
        console.log('📧 AgencyOwner email:', agencyOwner.email);
        console.log('✅ AgencyOwner isActive:', agencyOwner.isActive);
        console.log('✅ AgencyOwner isEmailVerified:', agencyOwner.isEmailVerified);
        console.log('🔑 AgencyOwner password hash length:', agencyOwner.password.length);
        console.log('🔑 AgencyOwner password starts with $2b$:', agencyOwner.password.indexOf('$2b$') === 0);
        
        // Verify password for AgencyOwner
        const isPasswordValid = await agencyOwner.comparePassword(password);
        console.log('✅ AgencyOwner password valid:', isPasswordValid);
        
        if (!isPasswordValid) {
          console.log('❌ AgencyOwner password invalid');
          console.log('🔍 Password being tested:', password);
          console.log('🔍 Stored hash:', agencyOwner.password);
          return next(createError(401, 'Invalid email or password'));
        }

        // Check if agency owner is active
        if (!agencyOwner.isActive) {
          console.log('❌ AgencyOwner account inactive');
          return next(createError(403, 'Your Account is inactive Please Contact Admin.'));
        }

        userType = 'agency_owner';
        userData = {
          id: agencyOwner.id,
          email: agencyOwner.email,
          name: agencyOwner.name,
          phone: agencyOwner.phone,
          role: 'agency_owner',
          agencyId: agencyOwner.agencyId,
          isEmailVerified: agencyOwner.isEmailVerified,
          lastLoginAt: agencyOwner.lastLoginAt,
          profileImage: agencyOwner.profileImage,
          address: agencyOwner.address,
          city: agencyOwner.city,
          pincode: agencyOwner.pincode,
          state: agencyOwner.state,
          createdAt: agencyOwner.createdAt,
          updatedAt: agencyOwner.updatedAt
        };

        // Update last login time
        await agencyOwner.update({ lastLoginAt: new Date() });
        console.log('✅ AgencyOwner login successful!');
      } else {
        console.log('❌ No AgencyOwner found with email:', email);
        return next(createError(401, 'Invalid email or password'));
      }
    }

    // Generate token with userType and additional data
    const additionalData = {};
    if (userData.agencyId) additionalData.agencyId = userData.agencyId;
    if (userData.deliveryAgentId) additionalData.deliveryAgentId = userData.deliveryAgentId;
    if (userData.email) additionalData.email = userData.email;
    
    // For agency_owner: if mustChangePassword is true, do not return token
    if (userType === 'agency_owner') {
      const ownerForPasswordCheck = agencyOwnerRecord || await AgencyOwner.findOne({ where: { email: emailWhereClause } });
      if (ownerForPasswordCheck && ownerForPasswordCheck.mustChangePassword) {
        return res.status(200).json({
          success: true,
          message: 'Please set a new password to continue.'
        });
      }
    }

    const token = generateToken(userData.id, userData.role || userType, additionalData);

    logger.info(`User logged in: ${email} (${userType})`);

    // Emit socket notification for user login
    const socketService = getSocketService();
    if (socketService) {
      socketService.emitNotification('USER_LOGGED_IN', {
        userId: userData.id,
        email: userData.email,
        role: userData.role || userType,
        name: userData.name,
        loginTime: new Date()
      }, ['admin']);
    }

    res.status(200).json({
      success: true,
      message: 'Login successful',
      data: {
        user: userData,
        token,
        userType
      }
    });
  } catch (error) {
    next(error);
  }
};

// Setup initial user (first time setup - Admin)
const setupUser = async (req, res, next) => {
  try {
    // Check if any admin user already exists
    const existingAdmin = await User.findOne({ where: { role: 'admin' } });
    if (existingAdmin) {
      return next(createError(400, 'Admin user already exists.'));
    }

    let email, password;

    // If credentials provided in request body, use them
    if (req.body.email && req.body.password) {
      const { error } = validateSetupUser.validate(req.body);
      if (error) {
        return next(createError(400, error.details[0].message));
      }
      email = req.body.email;
      password = req.body.password;
    } else {
      // Use default credentials from environment variables
      email = process.env.DEFAULT_EMAIL;
      password = process.env.DEFAULT_PASSWORD;
      
      if (!email || !password) {
        return next(createError(400, 'Default credentials not configured in environment variables'));
      }
    }

    // Create admin user
    const user = await User.create({
      email,
      password,
      role: 'admin'
    });

    // Generate token
    const token = generateToken(user.id);

    logger.info(`Admin user created: ${user.email}`);

    res.status(201).json({
      success: true,
      message: 'Admin user created successfully',
      data: {
        user: user.toPublicJSON(),
        token
      }
    });
  } catch (error) {
    next(error);
  }
};

// Get current user profile
const getProfile = async (req, res, next) => {
  try {
    console.log('🔍 PROFILE DEBUG - User ID:', req.user.userId);
    console.log('🔍 PROFILE DEBUG - User role:', req.user.role);
    
    let user = await User.findByPk(req.user.userId);
    let userData = null;
    
    console.log('🔍 PROFILE DEBUG - User found in User table:', !!user);
    
    if (user) {
      // User found in User table
      userData = user.toPublicJSON();
    } else {
      // Check AgencyOwner table
      console.log('🔍 PROFILE DEBUG - Checking AgencyOwner table...');
      const agencyOwner = await AgencyOwner.findByPk(req.user.userId);
      console.log('🔍 PROFILE DEBUG - AgencyOwner found:', !!agencyOwner);
      if (agencyOwner) {
        // Get agency status for agency owner
        const { Agency } = require('../models');
        const agency = await Agency.findByPk(agencyOwner.agencyId);
        
        // If agency owner's profileImage is null but agency has profileImage,
        // update the agency owner with the agency's image
        let finalProfileImage = agencyOwner.profileImage;
        if (!agencyOwner.profileImage && agency && agency.profileImage) {
          // Update agency owner with agency's image
          await agencyOwner.update({ profileImage: agency.profileImage });
          finalProfileImage = agency.profileImage;
        }
        
        userData = {
          id: agencyOwner.id,
          email: agencyOwner.email,
          name: agencyOwner.name,
          phone: agencyOwner.phone,
          role: 'agency_owner',
          agencyId: agencyOwner.agencyId,
          isEmailVerified: agencyOwner.isEmailVerified,
          lastLoginAt: agencyOwner.lastLoginAt,
          profileImage: finalProfileImage,
          address: agencyOwner.address,
          city: agencyOwner.city,
          pincode: agencyOwner.pincode,
          state: agencyOwner.state,
          agencyStatus: agency ? agency.status : null, // Add agency status for agency owner
          createdAt: agencyOwner.createdAt,
          updatedAt: agencyOwner.updatedAt
        };
      } else {
        return next(createError(404, 'User not found'));
      }
    }

    // Prepare response data
    let responseData = {
      user: userData
    };

    // If agent, include delivery agent data
    if (userData.role === 'agent' && user) {
      // First check if user has deliveryAgentId
      if (user.deliveryAgentId) {
        const deliveryAgent = await DeliveryAgent.findByPk(user.deliveryAgentId);
        if (deliveryAgent) {
          // Update user's name, phone, and profileImage with delivery agent data if they are null
          const updateData = {};
          if (!user.name && deliveryAgent.name) {
            updateData.name = deliveryAgent.name;
          }
          if (!user.phone && deliveryAgent.phone) {
            updateData.phone = deliveryAgent.phone;
          }
          if (!user.profileImage && deliveryAgent.profileImage) {
            updateData.profileImage = deliveryAgent.profileImage;
          }
          
          if (Object.keys(updateData).length > 0) {
            await user.update(updateData);
            // Update userData to reflect the changes
            userData.name = deliveryAgent.name;
            userData.phone = deliveryAgent.phone;
            userData.profileImage = deliveryAgent.profileImage;
          }
          
          responseData.deliveryAgent = {
            id: deliveryAgent.id,
            name: deliveryAgent.name,
            phone: deliveryAgent.phone,
            vehicleNumber: deliveryAgent.vehicleNumber,
            panCardNumber: deliveryAgent.panCardNumber,
            aadharCardNumber: deliveryAgent.aadharCardNumber,
            drivingLicence: deliveryAgent.drivingLicence,
            bankDetails: deliveryAgent.bankDetails,
            status: deliveryAgent.status,
            joinedAt: deliveryAgent.joinedAt,
            profileImage: deliveryAgent.profileImage
          };
        }
      } else {
        // Check if delivery agent exists with this email (admin might have added)
        const deliveryAgent = await DeliveryAgent.findOne({ where: { email: user.email } });
        if (deliveryAgent) {
          // Update user with delivery agent data and deliveryAgentId
          const updateData = {
            deliveryAgentId: deliveryAgent.id
          };
          if (!user.name && deliveryAgent.name) {
            updateData.name = deliveryAgent.name;
          }
          if (!user.phone && deliveryAgent.phone) {
            updateData.phone = deliveryAgent.phone;
          }
          if (!user.profileImage && deliveryAgent.profileImage) {
            updateData.profileImage = deliveryAgent.profileImage;
          }
          
          await user.update(updateData);
          // Update userData to reflect the changes
          userData.name = deliveryAgent.name;
          userData.phone = deliveryAgent.phone;
          userData.profileImage = deliveryAgent.profileImage;
          userData.deliveryAgentId = deliveryAgent.id;
          
          responseData.deliveryAgent = {
            id: deliveryAgent.id,
            name: deliveryAgent.name,
            phone: deliveryAgent.phone,
            vehicleNumber: deliveryAgent.vehicleNumber,
            panCardNumber: deliveryAgent.panCardNumber,
            aadharCardNumber: deliveryAgent.aadharCardNumber,
            drivingLicence: deliveryAgent.drivingLicence,
            bankDetails: deliveryAgent.bankDetails,
            status: deliveryAgent.status,
            joinedAt: deliveryAgent.joinedAt,
            profileImage: deliveryAgent.profileImage
          };
        }
      }
    }

    res.status(200).json({
      success: true,
      data: responseData
    });
  } catch (error) {
    next(error);
  }
};

// Complete customer profile
const completeCustomerProfile = async (req, res, next) => {
  try {
    const userId = req.user.userId;
    
    // Validate request body
    const { error, value } = validateCustomerProfile.validate(req.body);
    if (error) {
      return next(createError(400, error.details[0].message));
    }

    // Find user
    const user = await User.findByPk(userId);
    if (!user) {
      return next(createError(404, 'User not found'));
    }

    if (user.role !== 'customer') {
      return next(createError(403, 'Only customers can complete customer profile'));
    }

    // Update user profile
    await user.update({
      name: value.name,
      phone: value.phone,
      address: value.address,
      isProfileComplete: true,
      registeredAt: new Date()
    });

    logger.info(`Customer profile completed: ${user.email}`);

    res.status(200).json({
      success: true,
      message: 'Customer profile completed successfully',
      data: {
        user: user.toPublicJSON()
      }
    });
  } catch (error) {
    next(error);
  }
};

// Complete agent profile
const completeAgentProfile = async (req, res, next) => {
  try {
    const userId = req.user.userId;
    
    // Validate request body
    const { error, value } = validateAgentProfile.validate(req.body);
    if (error) {
      return next(createError(400, error.details[0].message));
    }

    // Find user
    const user = await User.findByPk(userId);
    if (!user) {
      return next(createError(404, 'User not found'));
    }

    if (user.role !== 'agent') {
      return next(createError(403, 'Only agents can complete agent profile'));
    }

    // Check if delivery agent exists with this email
    const deliveryAgent = await DeliveryAgent.findOne({ where: { email: user.email } });
    if (!deliveryAgent) {
      return next(createError(400, 'No delivery agent found with this email. Please contact admin.'));
    }

    // Update user profile
    const updateData = {
      name: value.name,
      phone: value.phone,
      address: value.address,
      deliveryAgentId: deliveryAgent.id,
      isProfileComplete: true,
      registeredAt: new Date()
    };
    
    // Include profile image from delivery agent if user doesn't have one
    if (!user.profileImage && deliveryAgent.profileImage) {
      updateData.profileImage = deliveryAgent.profileImage;
    }
    
    await user.update(updateData);

    logger.info(`Agent profile completed: ${user.email}`);

    res.status(200).json({
      success: true,
      message: 'Agent profile completed successfully',
      data: {
        user: user.toPublicJSON(),
        deliveryAgent: {
          id: deliveryAgent.id,
          name: deliveryAgent.name,
          phone: deliveryAgent.phone,
          vehicleNumber: deliveryAgent.vehicleNumber,
          panCardNumber: deliveryAgent.panCardNumber,
          aadharCardNumber: deliveryAgent.aadharCardNumber,
          drivingLicence: deliveryAgent.drivingLicence,
          bankDetails: deliveryAgent.bankDetails,
          status: deliveryAgent.status
        }
      }
    });
  } catch (error) {
    next(error);
  }
};

// Update user profile (with cloudinary image upload and multiple addresses)
const updateProfile = async (req, res, next) => {
  try {
    // Parse JSON strings if they come from form-data
    const body = { ...req.body };
    if (typeof body.addresses === 'string') {
      try { 
        body.addresses = JSON.parse(body.addresses); 
      } catch (parseError) {
        return next(createError(400, 'Invalid addresses JSON format'));
      }
    }

    // Validate request body
    const { error, value } = validateUpdateProfile.validate(body);
    if (error) {
      return next(createError(400, error.details[0].message));
    }

    const { name, email, phone, address, addresses } = value;
    const userId = req.user.userId;

    // Check if user is in User table or AgencyOwner table
    let user = await User.findByPk(userId);
    let userType = 'user';
    let userData = null;

    if (user) {
      userType = user.role; // This will be 'admin', 'customer', or 'agent'
      // Update user data
      const updateData = {};
      if (name !== undefined) updateData.name = name;
      if (email !== undefined) updateData.email = email;
      if (phone !== undefined) updateData.phone = phone;
      if (address !== undefined) updateData.address = address;
      if (addresses !== undefined) updateData.addresses = addresses;

      // Handle image upload if file is provided
      if (req.file) {
        // Use Cloudinary URL directly from multer-storage-cloudinary
        updateData.profileImage = req.file.path;
      }

      await user.update(updateData);
      userData = user.toPublicJSON();
    } else {
      // Try AgencyOwner table
      const agencyOwner = await AgencyOwner.findByPk(userId);
      if (agencyOwner) {
        userType = 'agency_owner';
        
        // Update agency owner data
        const updateData = {};
        if (name !== undefined) updateData.name = name;
        if (email !== undefined) updateData.email = email;
        if (phone !== undefined) updateData.phone = phone;
        if (address !== undefined) updateData.address = address;

        // Handle image upload if file is provided
        if (req.file) {
          // Use Cloudinary URL directly from multer-storage-cloudinary
          updateData.profileImage = req.file.path;
        }

        await agencyOwner.update(updateData);
        
        // If image was updated for agency owner, also update the agency's image
        if (req.file) {
          const { Agency } = require('../models');
          await Agency.update(
            { profileImage: req.file.path },
            { where: { id: agencyOwner.agencyId } }
          );
        }
        
        userData = agencyOwner.toPublicJSON();
      } else {
        return next(createError(404, 'User not found'));
      }
    }

    // If agent, also update delivery agent data
    let deliveryAgentData = null;
    if (userType === 'agent' && user && user.deliveryAgentId) {
      const deliveryAgent = await DeliveryAgent.findByPk(user.deliveryAgentId);
      if (deliveryAgent) {
        // Update delivery agent with user data
        const agentUpdateData = {};
        if (name !== undefined) agentUpdateData.name = name;
        if (phone !== undefined) agentUpdateData.phone = phone;
        if (req.file) agentUpdateData.profileImage = req.file.path;
        
        await deliveryAgent.update(agentUpdateData);
        
        deliveryAgentData = {
          id: deliveryAgent.id,
          name: deliveryAgent.name,
          phone: deliveryAgent.phone,
          vehicleNumber: deliveryAgent.vehicleNumber,
          panCardNumber: deliveryAgent.panCardNumber,
          aadharCardNumber: deliveryAgent.aadharCardNumber,
          drivingLicence: deliveryAgent.drivingLicence,
          bankDetails: deliveryAgent.bankDetails,
          status: deliveryAgent.status,
          joinedAt: deliveryAgent.joinedAt,
          profileImage: deliveryAgent.profileImage
        };
      }
    }

    logger.info(`User profile updated: ${userData.email}`);

    res.status(200).json({
      success: true,
      message: 'Profile updated successfully',
      data: {
        user: userData,
        ...(req.file && { imageUrl: req.file.path }), // Cloudinary URL
        ...(deliveryAgentData && { deliveryAgent: deliveryAgentData })
      }
    });
  } catch (error) {
    next(error);
  }
};

// Request OTP for customer/agent login
const requestOTP = async (req, res, next) => {
  try {
    // Validate request body
    const { error, value } = validateRequestOTP.validate(req.body);
    if (error) {
      return next(createError(400, error.details[0].message));
    }

    const { email, role } = value;

    // For agent role, check if agent exists in delivery_agents table
    if (role === 'agent') {
      const agent = await DeliveryAgent.findOne({ where: { email } });
      if (!agent) {
        logger.warn(`Unauthorized agent login attempt: ${email}`);
        return next(createError(403, 'You are not registered as a delivery agent. Please contact admin.'));
      }
      logger.info(`Agent login request from: ${email} (${agent.name})`);
    }

    // Check if user exists with this email and role
    let user = await User.findOne({ where: { email, role } });
    
    // If user doesn't exist, create a temporary user
    if (!user) {
      // Check if user with same email exists with different role
      const existingUser = await User.findOne({ where: { email } });
      if (existingUser) {
        return next(createError(400, `User with email ${email} already exists with role ${existingUser.role}. Please use the correct role.`));
      }
      
      user = await User.create({
        email,
        role,
        isProfileComplete: false
      });
      logger.info(`Temporary ${role} user created: ${email}`);
    }

    // Blocked user cannot request OTP
    if (user.isBlocked) {
      logger.warn(`Blocked user attempted OTP request: ${email} (${role})`);
      return next(createError(403, 'Your account is blocked by admin please contact.'));
    }

    // Generate OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

    // Delete any existing OTP for this email and role
    await LoginOTP.destroy({ where: { email, role } });

    // Create new OTP
    await LoginOTP.create({
      email,
      otp,
      role,
      expiresAt
    });

    // Send OTP via email
    const { sendEmail } = require('../config/email');
    await sendEmail(email, 'loginOTP', { email, otp });

    logger.info(`OTP sent to ${email} for ${role} login`);

    res.status(200).json({
      success: true,
      message: 'OTP sent successfully',
      data: {
        email,
        role,
        expiresAt,
        isNewUser: !user.isProfileComplete
      }
    });
  } catch (error) {
    next(error);
  }
};

// Verify OTP and login customer/agent
const verifyOTP = async (req, res, next) => {
  try {
    // Validate request body
    const { error, value } = validateVerifyOTP.validate(req.body);
    if (error) {
      return next(createError(400, error.details[0].message));
    }

    const { email, otp, role } = value;

    // For agent role, double-check if agent exists in delivery_agents table
    if (role === 'agent') {
      const agent = await DeliveryAgent.findOne({ where: { email } });
      if (!agent) {
        logger.warn(`Unauthorized agent OTP verification attempt: ${email}`);
        return next(createError(403, 'You are not registered as a delivery agent. Please contact admin.'));
      }
    }

    // Find the OTP record
    const otpRecord = await LoginOTP.findOne({
      where: { email, otp, role, isUsed: false }
    });

    if (!otpRecord) {
      return next(createError(400, 'Invalid OTP'));
    }

    // Check if OTP is expired
    if (new Date() > new Date(otpRecord.expiresAt)) {
      return next(createError(400, 'OTP has expired'));
    }

    // Mark OTP as used
    await otpRecord.update({ isUsed: true });

    // Find the user
    const user = await User.findOne({ where: { email, role } });
    if (!user) {
      return next(createError(404, 'User not found'));
    }

    // Blocked user cannot login
    if (user.isBlocked) {
      logger.warn(`Blocked user attempted OTP verify: ${email} (${role})`);
      return next(createError(403, 'Your account is blocked by admin please contact.'));
    }

    // Generate token with role and additional data
    const additionalData = { email: user.email };
    if (user.deliveryAgentId) additionalData.deliveryAgentId = user.deliveryAgentId;
    
    const token = generateToken(user.id, user.role, additionalData);

    logger.info(`User logged in with OTP: ${user.email} (${user.role})`);

    // If agent, include delivery agent data
    let responseData = {
      user: user.toPublicJSON(),
      token
    };

    if (role === 'agent') {
      // Get delivery agent data by email (since user might not have deliveryAgentId yet)
      const deliveryAgent = await DeliveryAgent.findOne({ where: { email } });
      if (deliveryAgent) {
        // Update user with delivery agent data and deliveryAgentId
        const updateData = {
          deliveryAgentId: deliveryAgent.id
        };
        if (!user.name && deliveryAgent.name) {
          updateData.name = deliveryAgent.name;
        }
        if (!user.phone && deliveryAgent.phone) {
          updateData.phone = deliveryAgent.phone;
        }
        
        await user.update(updateData);
        
        // Update userData to reflect the changes
        responseData.user.name = deliveryAgent.name;
        responseData.user.phone = deliveryAgent.phone;
        responseData.user.deliveryAgentId = deliveryAgent.id;
        
        responseData.deliveryAgent = {
          id: deliveryAgent.id,
          name: deliveryAgent.name,
          email: deliveryAgent.email,
          phone: deliveryAgent.phone,
          vehicleNumber: deliveryAgent.vehicleNumber,
          panCardNumber: deliveryAgent.panCardNumber,
          aadharCardNumber: deliveryAgent.aadharCardNumber,
          drivingLicence: deliveryAgent.drivingLicence,
          bankDetails: deliveryAgent.bankDetails,
          status: deliveryAgent.status,
          profileImage: deliveryAgent.profileImage,
          joinedAt: deliveryAgent.joinedAt
        };
      }
    }

    res.status(200).json({
      success: true,
      message: 'Login successful',
      data: responseData
    });
  } catch (error) {
    next(error);
  }
};

// Logout user
const logout = async (req, res, next) => {
  try {
    // In a simple system, we just return success
    // In production, you might want to blacklist the token
    logger.info(`User logged out: ${req.user.userId}`);

    res.status(200).json({
      success: true,
      message: 'Logged out successfully'
    });
  } catch (error) {
    next(error);
  }
};

// Admin: Request OTP for password reset
const forgotPasswordRequest = async (req, res, next) => {
  try {
    const { error, value } = validateForgotPasswordRequest.validate(req.body);
    if (error) {
      return next(createError(400, error.details[0].message));
    }

    const { email } = value;

    // Check if user exists in User table (Admin)
    let user = await User.findOne({ where: { email, role: 'admin' } });
    let userType = 'admin';

    if (user) {
      // Generate OTP for admin
      const otp = Math.floor(100000 + Math.random() * 900000).toString();
      const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

      // Delete any existing OTP for this email and role 'admin'
      await LoginOTP.destroy({ where: { email, role: 'admin' } });

      // Create new OTP
      await LoginOTP.create({ email, otp, role: 'admin', expiresAt });

      // Send OTP via email
      const { sendEmail } = require('../config/email');
      await sendEmail(email, 'passwordResetOTP', { email, otp });

      logger.info(`Password reset OTP sent to admin ${email}`);
    } else {
      // Check if agency owner exists
      const agencyOwner = await AgencyOwner.findOne({ where: { email } });
      if (agencyOwner) {
        // Allow password reset for agency owners regardless of email verification status
        // if (!agencyOwner.isEmailVerified) {
        //   return next(createError(403, 'Please verify your email before resetting password'));
        // }

        userType = 'agency_owner';

        // Generate OTP for agency owner
        const otp = Math.floor(100000 + Math.random() * 900000).toString();
        const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

        // Delete any existing OTP for this email and role 'agency_owner'
        await LoginOTP.destroy({ where: { email, role: 'agency_owner' } });

        // Create new OTP
        await LoginOTP.create({ email, otp, role: 'agency_owner', expiresAt });

        // Send OTP via email
        const { sendEmail } = require('../config/email');
        await sendEmail(email, 'passwordResetOTP', { email, otp });

        logger.info(`Password reset OTP sent to agency owner ${email}`);
      } else {
        return next(createError(404, 'Account not found'));
      }
    }

    res.status(200).json({
      success: true,
      message: 'OTP sent to email for password reset',
      data: { email, userType }
    });
  } catch (error) {
    next(error);
  }
};

// Admin: Reset password using OTP
const resetPassword = async (req, res, next) => {
  try {
    const { error, value } = validateResetPassword.validate(req.body);
    if (error) {
      return next(createError(400, error.details[0].message));
    }

    const { email, otp, newPassword } = value;

    // Try to find OTP record for admin first
    let otpRecord = await LoginOTP.findOne({
      where: { email, otp, role: 'admin', isUsed: false }
    });

    let userType = 'admin';
    let user = null;

    if (otpRecord) {
      // Admin OTP found
      user = await User.findOne({ where: { email, role: 'admin' } });
      if (!user) {
        return next(createError(404, 'Admin account not found'));
      }
    } else {
      // Try agency owner OTP
      otpRecord = await LoginOTP.findOne({
        where: { email, otp, role: 'agency_owner', isUsed: false }
      });

      if (otpRecord) {
        userType = 'agency_owner';
        const agencyOwner = await AgencyOwner.findOne({ where: { email: emailWhereClause } });
        if (!agencyOwner) {
          return next(createError(404, 'Agency owner account not found'));
        }
        user = agencyOwner;
      } else {
        return next(createError(400, 'Invalid OTP'));
      }
    }

    if (new Date() > new Date(otpRecord.expiresAt)) {
      return next(createError(400, 'OTP has expired'));
    }

    // Update password (hooks will hash)
    await user.update({ password: newPassword });

    // Mark OTP as used
    await otpRecord.update({ isUsed: true });

    logger.info(`${userType} password reset successful for ${email}`);

    res.status(200).json({
      success: true,
      message: 'Password reset successful. Please login with new password.'
    });
  } catch (error) {
    next(error);
  }
};

// Delete user account
const deleteAccount = async (req, res, next) => {
  try {
    const userId = req.user.userId;
    
    // Validate request body
    const { error } = validateDeleteAccount.validate(req.body);
    if (error) {
      return next(createError(400, error.details[0].message));
    }

    // Find user
    const user = await User.findByPk(userId);
    if (!user) {
      return next(createError(404, 'User not found'));
    }

    // Only allow customers and agents to delete their own accounts
    if (user.role === 'admin') {
      return next(createError(403, 'Admin accounts cannot be deleted through this endpoint'));
    }

    const userEmail = user.email;
    const userRole = user.role;

    // Use database transaction to ensure all related data is cleaned up
    const { sequelize } = require('../config/database');
    await sequelize.transaction(async (transaction) => {
      // Delete related data based on user role
      if (userRole === 'customer') {
        // Delete customer's orders (optional - you might want to keep them for business records)
        // await Order.destroy({ where: { userId }, transaction });
        
        // Delete customer's login OTPs
        await LoginOTP.destroy({ where: { email: userEmail, role: userRole }, transaction });
        
        logger.info(`Customer account deleted: ${userEmail}`);
      } else if (userRole === 'agent') {
        // For agents, also clean up delivery agent data
        if (user.deliveryAgentId) {
          await DeliveryAgent.destroy({ where: { id: user.deliveryAgentId }, transaction });
        }
        
        // Delete agent's login OTPs
        await LoginOTP.destroy({ where: { email: userEmail, role: userRole }, transaction });
        
        logger.info(`Agent account deleted: ${userEmail}`);
      }

      // Finally, delete the user account
      await user.destroy({ transaction });
    });

    res.status(200).json({
      success: true,
      message: 'Account deleted successfully',
      data: {
        deletedEmail: userEmail,
        deletedRole: userRole,
        deletedAt: new Date().toISOString()
      }
    });
  } catch (error) {
    logger.error(`Error deleting account: ${error.message}`);
    next(error);
  }
};

// Get all customers (Admin and Agency Owner)
const getAllCustomers = async (req, res, next) => {
  try {
    const userRole = req.user.role;
    
    // Check if user is admin or agency owner
    if (userRole !== 'admin' && userRole !== 'agency_owner') {
      return next(createError(403, 'Only admin and agency owners can access customer list'));
    }

    let currentUser;
    if (userRole === 'admin') {
      currentUser = await User.findByPk(req.user.userId);
    } else {
      // For agency owner, get from AgencyOwner table
      currentUser = await AgencyOwner.findByPk(req.user.userId);
    }

    // Get query parameters for pagination and filtering
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const offset = (page - 1) * limit;
    const search = req.query.search || '';
    const status = req.query.status || ''; // active, inactive, or all

    // Build where clause
    const whereClause = {
      role: 'customer'
    };

    // Add search filter
    if (search) {
      whereClause[Op.or] = [
        { name: { [Op.iLike]: `%${search}%` } },
        { email: { [Op.iLike]: `%${search}%` } },
        { phone: { [Op.iLike]: `%${search}%` } }
      ];
    }

    // Add status filter
    if (status && status !== 'all') {
      whereClause.isProfileComplete = status === 'active';
    }

    // For agency owners, get only customers who have orders with their agency
    if (userRole === 'agency_owner') {
      const { Order } = require('../models');
      
      // Get customer emails who have orders with this agency
      const agencyOrders = await Order.findAll({
        where: { agencyId: req.user.agencyId },
        attributes: ['customerEmail'],
        group: ['customerEmail']
      });
      
      const customerEmails = agencyOrders.map(order => order.customerEmail);
      
      if (customerEmails.length === 0) {
        // No customers found for this agency
        return res.status(200).json({
          success: true,
          message: 'No customers found for your agency',
          data: {
            customers: [],
            pagination: {
              currentPage: page,
              totalPages: 0,
              totalItems: 0,
              itemsPerPage: limit
            }
          }
        });
      }
      
      // Add customer email filter
      whereClause.email = { [Op.in]: customerEmails };
    }

    // Get customers with pagination
    const { count, rows: customers } = await User.findAndCountAll({
      where: whereClause,
      attributes: [
        'id', 'name', 'email', 'phone', 'role', 'profileImage',
        'address', 'addresses', 'isProfileComplete', 'registeredAt', 'isBlocked',
        'createdAt', 'updatedAt'
      ],
      order: [['createdAt', 'DESC']],
      limit,
      offset
    });

    // Calculate pagination info
    const totalPages = Math.ceil(count / limit);
    const hasNextPage = page < totalPages;
    const hasPrevPage = page > 1;

    logger.info(`Admin ${currentUser.email} accessed customer list. Found ${count} customers.`);

    res.status(200).json({
      success: true,
      message: 'Customers retrieved successfully',
      data: {
        customers,
        pagination: {
          currentPage: page,
          totalPages,
          totalCustomers: count,
          limit,
          hasNextPage,
          hasPrevPage
        }
      }
    });
  } catch (error) {
    logger.error(`Error getting customers: ${error.message}`);
    next(error);
  }
};

// Admin: Block or unblock a user
const setUserBlockStatus = async (req, res, next) => {
  try {
    const admin = await User.findByPk(req.user.userId);
    if (!admin || admin.role !== 'admin') {
      return next(createError(403, 'Only admin can perform this action'));
    }

    const { userId } = req.params;
    const { isBlocked } = req.body;

    if (typeof isBlocked !== 'boolean') {
      return next(createError(400, 'isBlocked must be a boolean'));
    }

    const user = await User.findByPk(userId);
    if (!user) {
      return next(createError(404, 'User not found'));
    }

    await user.update({ isBlocked });

    logger.info(`Admin ${admin.email} set block=${isBlocked} for ${user.email} (${user.role})`);

    // Emit socket notification for user block/unblock
    const socketService = getSocketService();
    if (socketService) {
      // Notify admin about the action
      socketService.emitNotification('USER_BLOCK_STATUS_CHANGED', {
        userId: user.id,
        email: user.email,
        role: user.role,
        name: user.name,
        isBlocked: isBlocked,
        blockedBy: admin.email,
        timestamp: new Date()
      }, ['admin']);

      // If user is blocked, force logout by sending logout event to that user
      if (isBlocked) {
        socketService.sendToUserByEmail(user.email, 'user:force-logout', {
          type: 'ACCOUNT_BLOCKED',
          message: 'Your account has been blocked by admin. You will be logged out.',
          timestamp: new Date()
        });
      }
    }

    res.status(200).json({
      success: true,
      message: `User ${isBlocked ? 'blocked' : 'unblocked'} successfully`,
      data: { user: user.toPublicJSON() }
    });
  } catch (error) {
    next(error);
  }
};

// Update agent profile (basic update for delivery agent data)
const updateAgentProfile = async (req, res, next) => {
  try {
    const userId = req.user.userId;
    const user = await User.findByPk(userId);
    
    if (!user) {
      return next(createError(404, 'User not found'));
    }

    if (user.role !== 'agent') {
      return next(createError(403, 'Only agents can update agent profile'));
    }

    // Get delivery agent data
    let deliveryAgent;
    if (user.deliveryAgentId) {
      deliveryAgent = await DeliveryAgent.findByPk(user.deliveryAgentId);
    } else {
      // Find by email if deliveryAgentId is not set
      deliveryAgent = await DeliveryAgent.findOne({ where: { email: user.email } });
      if (deliveryAgent) {
        await user.update({ deliveryAgentId: deliveryAgent.id });
      }
    }

    if (!deliveryAgent) {
      return next(createError(404, 'Delivery agent data not found'));
    }

    // Parse JSON strings if they come from form-data
    const body = { ...req.body };
    if (typeof body.addresses === 'string') {
      try { 
        body.addresses = JSON.parse(body.addresses); 
      } catch (parseError) {
        return next(createError(400, 'Invalid addresses JSON format'));
      }
    }

    // Validate request body
    const { error, value } = validateUpdateProfile.validate(body);
    if (error) {
      return next(createError(400, error.details[0].message));
    }

    const { name, phone, address, addresses } = value;

    // Update user data
    const userUpdateData = {};
    if (name !== undefined) userUpdateData.name = name;
    if (phone !== undefined) userUpdateData.phone = phone;
    if (address !== undefined) userUpdateData.address = address;
    if (addresses !== undefined) userUpdateData.addresses = addresses;

    // Handle cloudinary image upload if file is provided
    if (req.file) {
      userUpdateData.profileImage = req.file.path; // Cloudinary URL
    }

    await user.update(userUpdateData);

    // Update delivery agent data
    const agentUpdateData = {};
    if (name !== undefined) agentUpdateData.name = name;
    if (phone !== undefined) agentUpdateData.phone = phone;
    if (req.file) agentUpdateData.profileImage = req.file.path;

    await deliveryAgent.update(agentUpdateData);

    // Get updated data
    const updatedUser = await User.findByPk(userId);
    const updatedAgent = await DeliveryAgent.findByPk(deliveryAgent.id);

    logger.info(`Agent profile updated: ${user.email}`);

    res.status(200).json({
      success: true,
      message: 'Agent profile updated successfully',
      data: {
        user: updatedUser.toPublicJSON(),
        deliveryAgent: {
          id: updatedAgent.id,
          name: updatedAgent.name,
          email: updatedAgent.email,
          phone: updatedAgent.phone,
          vehicleNumber: updatedAgent.vehicleNumber,
          panCardNumber: updatedAgent.panCardNumber,
          aadharCardNumber: updatedAgent.aadharCardNumber,
          drivingLicence: updatedAgent.drivingLicence,
          bankDetails: updatedAgent.bankDetails,
          status: updatedAgent.status,
          profileImage: updatedAgent.profileImage,
          joinedAt: updatedAgent.joinedAt
        },
        ...(req.file && { imageUrl: req.file.path }) // Cloudinary URL
      }
    });
  } catch (error) {
    next(error);
  }
};

// Update agent profile comprehensively (all fields including sensitive data)
const updateAgentProfileComplete = async (req, res, next) => {
  try {
    const userId = req.user.userId;
    const user = await User.findByPk(userId);
    
    if (!user) {
      return next(createError(404, 'User not found'));
    }

    if (user.role !== 'agent') {
      return next(createError(403, 'Only agents can update agent profile'));
    }

    // Get delivery agent data
    let deliveryAgent;
    if (user.deliveryAgentId) {
      deliveryAgent = await DeliveryAgent.findByPk(user.deliveryAgentId);
    } else {
      // Find by email if deliveryAgentId is not set
      deliveryAgent = await DeliveryAgent.findOne({ where: { email: user.email } });
      if (deliveryAgent) {
        await user.update({ deliveryAgentId: deliveryAgent.id });
      }
    }

    if (!deliveryAgent) {
      return next(createError(404, 'Delivery agent data not found'));
    }

    // Parse JSON strings if they come from form-data
    const body = { ...req.body };
    if (typeof body.addresses === 'string') {
      try { 
        body.addresses = JSON.parse(body.addresses); 
      } catch (parseError) {
        return next(createError(400, 'Invalid addresses JSON format'));
      }
    }

    // Validate request body
    const { error, value } = updateAgentProfileComprehensive.validate(body);
    if (error) {
      return next(createError(400, error.details[0].message));
    }

    const { 
      name, 
      phone, 
      address, 
      addresses,
      vehicleNumber,
      panCardNumber,
      aadharCardNumber,
      drivingLicence,
      bankDetails,
      status
    } = value;

    // Update user data
    const userUpdateData = {};
    if (name !== undefined) userUpdateData.name = name;
    if (phone !== undefined) userUpdateData.phone = phone;
    if (address !== undefined) userUpdateData.address = address;
    if (addresses !== undefined) userUpdateData.addresses = addresses;

    // Handle cloudinary image upload if file is provided
    if (req.file) {
      userUpdateData.profileImage = req.file.path; // Cloudinary URL
    }

    await user.update(userUpdateData);

    // Update delivery agent data
    const agentUpdateData = {};
    if (name !== undefined) agentUpdateData.name = name;
    if (phone !== undefined) agentUpdateData.phone = phone;
    if (vehicleNumber !== undefined) agentUpdateData.vehicleNumber = vehicleNumber;
    if (panCardNumber !== undefined) agentUpdateData.panCardNumber = panCardNumber;
    if (aadharCardNumber !== undefined) agentUpdateData.aadharCardNumber = aadharCardNumber;
    if (drivingLicence !== undefined) agentUpdateData.drivingLicence = drivingLicence;
    if (bankDetails !== undefined) agentUpdateData.bankDetails = bankDetails;
    if (status !== undefined) agentUpdateData.status = status;
    if (req.file) agentUpdateData.profileImage = req.file.path;

    // Check for duplicate sensitive data (if being updated)
    if (vehicleNumber && vehicleNumber !== deliveryAgent.vehicleNumber) {
      const existingVehicle = await DeliveryAgent.findOne({ 
        where: { vehicleNumber, id: { [Op.ne]: deliveryAgent.id } } 
      });
      if (existingVehicle) {
        return next(createError(400, 'Vehicle number already exists'));
      }
    }

    if (panCardNumber && panCardNumber !== deliveryAgent.panCardNumber) {
      const existingPan = await DeliveryAgent.findOne({ 
        where: { panCardNumber, id: { [Op.ne]: deliveryAgent.id } } 
      });
      if (existingPan) {
        return next(createError(400, 'PAN card number already exists'));
      }
    }

    if (aadharCardNumber && aadharCardNumber !== deliveryAgent.aadharCardNumber) {
      const existingAadhar = await DeliveryAgent.findOne({ 
        where: { aadharCardNumber, id: { [Op.ne]: deliveryAgent.id } } 
      });
      if (existingAadhar) {
        return next(createError(400, 'Aadhar card number already exists'));
      }
    }

    if (drivingLicence && drivingLicence !== deliveryAgent.drivingLicence) {
      const existingLicence = await DeliveryAgent.findOne({ 
        where: { drivingLicence, id: { [Op.ne]: deliveryAgent.id } } 
      });
      if (existingLicence) {
        return next(createError(400, 'Driving licence already exists'));
      }
    }

    await deliveryAgent.update(agentUpdateData);

    // Get updated data
    const updatedUser = await User.findByPk(userId);
    const updatedAgent = await DeliveryAgent.findByPk(deliveryAgent.id);

    logger.info(`Agent comprehensive profile updated: ${user.email}`);

    res.status(200).json({
      success: true,
      message: 'Agent profile updated successfully',
      data: {
        user: updatedUser.toPublicJSON(),
        deliveryAgent: {
          id: updatedAgent.id,
          name: updatedAgent.name,
          email: updatedAgent.email,
          phone: updatedAgent.phone,
          vehicleNumber: updatedAgent.vehicleNumber,
          panCardNumber: updatedAgent.panCardNumber,
          aadharCardNumber: updatedAgent.aadharCardNumber,
          drivingLicence: updatedAgent.drivingLicence,
          bankDetails: updatedAgent.bankDetails,
          status: updatedAgent.status,
          profileImage: updatedAgent.profileImage,
          joinedAt: updatedAgent.joinedAt
        },
        ...(req.file && { imageUrl: req.file.path }) // Cloudinary URL
      }
    });
  } catch (error) {
    next(error);
  }
};

// Update agent status only (online/offline)
const updateAgentStatus = async (req, res, next) => {
  try {
    const userId = req.user.userId;
    const user = await User.findByPk(userId);
    
    if (!user) {
      return next(createError(404, 'User not found'));
    }

    if (user.role !== 'agent') {
      return next(createError(403, 'Only agents can update their status'));
    }

    // Get delivery agent data
    let deliveryAgent;
    if (user.deliveryAgentId) {
      deliveryAgent = await DeliveryAgent.findByPk(user.deliveryAgentId);
    } else {
      // Find by email if deliveryAgentId is not set
      deliveryAgent = await DeliveryAgent.findOne({ where: { email: user.email } });
      if (deliveryAgent) {
        await user.update({ deliveryAgentId: deliveryAgent.id });
      }
    }

    if (!deliveryAgent) {
      return next(createError(404, 'Delivery agent data not found'));
    }

    // Validate request body
    const { error, value } = require('../validations/deliveryAgentValidation').updateStatus.validate(req.body);
    if (error) {
      return next(createError(400, error.details[0].message));
    }

    const { status } = value;

    // Update delivery agent status
    await deliveryAgent.update({ status });

    // Get updated data
    const updatedAgent = await DeliveryAgent.findByPk(deliveryAgent.id);

    logger.info(`Agent status updated: ${user.email} - ${status}`);

    // Emit socket notification for agent status change
    const socketService = getSocketService();
    if (socketService) {
      socketService.emitAgentStatusUpdated({
        id: updatedAgent.id,
        name: updatedAgent.name,
        email: updatedAgent.email,
        phone: updatedAgent.phone,
        agencyId: updatedAgent.agencyId,
        status: updatedAgent.status,
        updatedBy: user.email,
        timestamp: new Date()
      });
    }

    res.status(200).json({
      success: true,
      message: 'Agent status updated successfully',
      data: {
        user: user.toPublicJSON(),
        deliveryAgent: {
          id: updatedAgent.id,
          name: updatedAgent.name,
          email: updatedAgent.email,
          phone: updatedAgent.phone,
          vehicleNumber: updatedAgent.vehicleNumber,
          panCardNumber: updatedAgent.panCardNumber,
          aadharCardNumber: updatedAgent.aadharCardNumber,
          drivingLicence: updatedAgent.drivingLicence,
          bankDetails: updatedAgent.bankDetails,
          status: updatedAgent.status,
          profileImage: updatedAgent.profileImage,
          joinedAt: updatedAgent.joinedAt
        }
      }
    });
  } catch (error) {
    next(error);
  }
};

// Get detailed customer information with all orders and delivery details (Admin and Agency Owner)
const getCustomerDetails = async (req, res, next) => {
  try {
    const userRole = req.user.role;
    const { customerId } = req.params;
    
    // Check if user is admin or agency owner
    if (userRole !== 'admin' && userRole !== 'agency_owner') {
      return next(createError(403, 'Only admin and agency owners can access customer details'));
    }

    // Find the customer
    const customer = await User.findByPk(customerId, {
      where: { role: 'customer' }
    });

    if (!customer) {
      return next(createError(404, 'Customer not found'));
    }

    // For agency owners, check if customer has orders with their agency
    if (userRole === 'agency_owner') {
      const { Order } = require('../models');
      
      // Check if customer has any orders with this agency
      const hasOrdersWithAgency = await Order.findOne({
        where: { 
          customerEmail: customer.email,
          agencyId: req.user.agencyId 
        }
      });
      
      if (!hasOrdersWithAgency) {
        return next(createError(403, 'This customer has no orders with your agency'));
      }
    }

    // Get all orders for this customer with full details
    const { Order, DeliveryAgent, Agency } = require('../models');
    
    const orders = await Order.findAll({
      where: { customerEmail: customer.email },
      include: [
        {
          model: DeliveryAgent,
          as: 'DeliveryAgent',
          attributes: [
            'id', 'name', 'email', 'phone', 'vehicleNumber', 
            'status', 'profileImage', 'joinedAt'
          ],
          include: [
            {
              model: Agency,
              as: 'Agency',
              attributes: ['id', 'name', 'email', 'phone', 'address', 'city']
            }
          ]
        },
        {
          model: Agency,
          as: 'Agency',
          attributes: ['id', 'name', 'email', 'phone', 'address', 'city']
        }
      ],
      order: [['createdAt', 'DESC']]
    });

    // Calculate customer statistics
    const totalOrders = orders.length;
    const completedOrders = orders.filter(order => order.status === 'delivered').length;
    const pendingOrders = orders.filter(order => ['pending', 'confirmed', 'assigned', 'out_for_delivery'].includes(order.status)).length;
    const cancelledOrders = orders.filter(order => order.status === 'cancelled').length;
    const totalSpent = orders
      .filter(order => order.status === 'delivered')
      .reduce((sum, order) => sum + parseFloat(order.totalAmount || 0), 0);

    // Get unique delivery agents who delivered to this customer
    const deliveryAgents = orders
      .filter(order => order.DeliveryAgent)
      .map(order => order.DeliveryAgent)
      .filter((agent, index, self) => 
        index === self.findIndex(a => a.id === agent.id)
      );

    // Get order status distribution
    const statusDistribution = orders.reduce((acc, order) => {
      acc[order.status] = (acc[order.status] || 0) + 1;
      return acc;
    }, {});

    // Get recent activity (last 10 orders)
    const recentOrders = orders.slice(0, 10).map(order => ({
      id: order.id,
      orderNumber: order.orderNumber,
      status: order.status,
      totalAmount: order.totalAmount,
      createdAt: order.createdAt,
      deliveredAt: order.deliveredAt,
      deliveryAgent: order.DeliveryAgent ? {
        id: order.DeliveryAgent.id,
        name: order.DeliveryAgent.name,
        phone: order.DeliveryAgent.phone,
        vehicleNumber: order.DeliveryAgent.vehicleNumber,
        agency: order.DeliveryAgent.Agency ? {
          id: order.DeliveryAgent.Agency.id,
          name: order.DeliveryAgent.Agency.name
        } : null
      } : null,
      agency: order.Agency ? {
        id: order.Agency.id,
        name: order.Agency.name,
        city: order.Agency.city
      } : null,
      items: order.items,
      deliveryProofImage: order.deliveryProofImage,
      deliveryNote: order.deliveryNote,
      paymentReceived: order.paymentReceived
    }));

    logger.info(`Customer details accessed: ${customer.email} by ${userRole} ${req.user.userId}`);

    res.status(200).json({
      success: true,
      message: 'Customer details retrieved successfully',
      data: {
        customer: {
          id: customer.id,
          name: customer.name,
          email: customer.email,
          phone: customer.phone,
          role: customer.role,
          profileImage: customer.profileImage,
          address: customer.address,
          addresses: customer.addresses,
          isProfileComplete: customer.isProfileComplete,
          registeredAt: customer.registeredAt,
          isBlocked: customer.isBlocked,
          createdAt: customer.createdAt,
          updatedAt: customer.updatedAt
        },
        statistics: {
          totalOrders,
          completedOrders,
          pendingOrders,
          cancelledOrders,
          totalSpent: parseFloat(totalSpent.toFixed(2)),
          statusDistribution
        },
        deliveryAgents: deliveryAgents.map(agent => ({
          id: agent.id,
          name: agent.name,
          email: agent.email,
          phone: agent.phone,
          vehicleNumber: agent.vehicleNumber,
          status: agent.status,
          profileImage: agent.profileImage,
          joinedAt: agent.joinedAt,
          agency: agent.Agency ? {
            id: agent.Agency.id,
            name: agent.Agency.name,
            email: agent.Agency.email,
            phone: agent.Agency.phone,
            address: agent.Agency.address,
            city: agent.Agency.city
          } : null
        })),
        recentOrders,
        allOrders: orders.map(order => ({
          id: order.id,
          orderNumber: order.orderNumber,
          status: order.status,
          totalAmount: order.totalAmount,
          paymentMethod: order.paymentMethod,
          paymentStatus: order.paymentStatus,
          deliveryMode: order.deliveryMode,
          customerAddress: order.customerAddress,
          items: order.items,
          createdAt: order.createdAt,
          confirmedAt: order.confirmedAt,
          assignedAt: order.assignedAt,
          outForDeliveryAt: order.outForDeliveryAt,
          deliveredAt: order.deliveredAt,
          cancelledAt: order.cancelledAt,
          cancelledBy: order.cancelledBy,
          cancelledByName: order.cancelledByName,
          returnedAt: order.returnedAt,
          returnedBy: order.returnedBy,
          returnedByName: order.returnedByName,
          returnReason: order.returnReason,
          adminNotes: order.adminNotes,
          agentNotes: order.agentNotes,
          deliveryProofImage: order.deliveryProofImage,
          deliveryNote: order.deliveryNote,
          paymentReceived: order.paymentReceived,
          deliveryAgent: order.DeliveryAgent ? {
            id: order.DeliveryAgent.id,
            name: order.DeliveryAgent.name,
            email: order.DeliveryAgent.email,
            phone: order.DeliveryAgent.phone,
            vehicleNumber: order.DeliveryAgent.vehicleNumber,
            status: order.DeliveryAgent.status,
            profileImage: order.DeliveryAgent.profileImage,
            joinedAt: order.DeliveryAgent.joinedAt,
            agency: order.DeliveryAgent.Agency ? {
              id: order.DeliveryAgent.Agency.id,
              name: order.DeliveryAgent.Agency.name,
              email: order.DeliveryAgent.Agency.email,
              phone: order.DeliveryAgent.Agency.phone,
              address: order.DeliveryAgent.Agency.address,
              city: order.DeliveryAgent.Agency.city
            } : null
          } : null,
          agency: order.Agency ? {
            id: order.Agency.id,
            name: order.Agency.name,
            email: order.Agency.email,
            phone: order.Agency.phone,
            address: order.Agency.address,
            city: order.Agency.city
          } : null
        }))
      }
    });
  } catch (error) {
    logger.error(`Error getting customer details: ${error.message}`);
    next(error);
  }
};

// Set initial password for agency owner (no auth)
const setAgencyOwnerInitialPassword = async (req, res, next) => {
  try {
    const { error, value } = validateAgencyOwnerInitialPassword.validate(req.body);
    if (error) {
      return next(createError(400, error.details[0].message));
    }

    const { email, password } = value;

    const agencyOwner = await AgencyOwner.findOne({ where: { email } });
    if (!agencyOwner) {
      return next(createError(404, 'Agency owner not found'));
    }

    // Allow setting initial password only if mustChangePassword is true
    if (!agencyOwner.mustChangePassword) {
      return next(createError(400, 'Password already set. Please login normally.'));
    }

    await agencyOwner.update({ password, mustChangePassword: false, isEmailVerified: true });

    // After setting password, auto-login and return token like normal
    const additionalData = { email: agencyOwner.email, agencyId: agencyOwner.agencyId };
    const token = generateToken(agencyOwner.id, 'agency_owner', additionalData);

    const userData = {
      id: agencyOwner.id,
      email: agencyOwner.email,
      name: agencyOwner.name,
      phone: agencyOwner.phone,
      role: 'agency_owner',
      agencyId: agencyOwner.agencyId,
      isEmailVerified: agencyOwner.isEmailVerified,
      lastLoginAt: agencyOwner.lastLoginAt,
      profileImage: agencyOwner.profileImage,
      address: agencyOwner.address,
      city: agencyOwner.city,
      pincode: agencyOwner.pincode,
      state: agencyOwner.state,
      createdAt: agencyOwner.createdAt,
      updatedAt: agencyOwner.updatedAt
    };

    logger.info(`Agency owner initial password set: ${email}`);

    res.status(200).json({
      success: true,
      message: 'Password set successfully',
      data: {
        user: userData,
        token,
        userType: 'agency_owner'
      }
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  login,
  setupUser,
  completeCustomerProfile,
  completeAgentProfile,
  requestOTP,
  verifyOTP,
  getProfile,
  updateProfile,
  updateAgentProfile,
  updateAgentProfileComplete,
  updateAgentStatus,
  logout,
  deleteAccount,
  getAllCustomers,
  getCustomerDetails,
  setUserBlockStatus,
  forgotPasswordRequest,
  resetPassword,
  setAgencyOwnerInitialPassword
};
