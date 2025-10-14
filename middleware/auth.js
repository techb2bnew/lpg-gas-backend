const jwt = require('jsonwebtoken');
const { User, AgencyOwner } = require('../models');
const { createError } = require('../utils/errorHandler');

// Authenticate user middleware
const authenticate = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return next(createError(401, 'Access token required'));
    }

    const token = authHeader.substring(7); // Remove 'Bearer ' prefix

    // Verify token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    // Check if user exists in User table first
    let user = await User.findByPk(decoded.userId);
    let userType = 'user';
    let userData = null;

    if (user) {
      userType = user.role;
      userData = {
        id: user.id,
        userId: user.id,
        email: user.email,
        role: user.role,
        deliveryAgentId: user.deliveryAgentId
      };
    } else {
      // If not found in User table, check AgencyOwner table
      const agencyOwner = await AgencyOwner.findByPk(decoded.userId);
      if (agencyOwner) {
        userType = 'agency_owner';
        userData = {
          id: agencyOwner.id,
          userId: agencyOwner.id,
          email: agencyOwner.email,
          role: 'agency_owner',
          agencyId: agencyOwner.agencyId,
          deliveryAgentId: null
        };
      } else {
        return next(createError(401, 'User not found'));
      }
    }

    // Add user info to request
    req.user = userData;

    next();
  } catch (error) {
    if (error.name === 'JsonWebTokenError') {
      return next(createError(401, 'Invalid token'));
    }
    if (error.name === 'TokenExpiredError') {
      return next(createError(401, 'Token expired'));
    }
    next(error);
  }
};

// Optional authentication middleware
const optionalAuth = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return next();
    }

    const token = authHeader.substring(7);
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    const user = await User.findByPk(decoded.userId);
    if (user) {
      req.user = {
        id: user.id,
        userId: user.id,
        email: user.email,
        role: user.role,
        deliveryAgentId: user.deliveryAgentId
      };
    }

    next();
  } catch (error) {
    // Continue without authentication if token is invalid
    next();
  }
};

// Authorize user middleware (check role)
const authorize = (...roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return next(createError(401, 'Authentication required'));
    }

    if (!roles.includes(req.user.role)) {
      return next(createError(403, 'Access denied. Insufficient permissions'));
    }

    next();
  };
};

module.exports = {
  authenticate,
  optionalAuth,
  authorize
};
