const { AgencyOwner } = require('../models');
const { sequelize } = require('../config/database');
const bcrypt = require('bcrypt');
const logger = require('../utils/logger');

// Middleware to automatically fix double-hashed passwords for agency owners
const fixAgencyPassword = async (req, res, next) => {
  try {
    // Only run for login requests
    if (req.path === '/api/auth/login' && req.method === 'POST') {
      const { email } = req.body;
      
      if (email) {
        // Check if this is an agency owner
        const agencyOwner = await AgencyOwner.findOne({
          where: { email },
          attributes: ['id', 'email', 'password']
        });

        if (agencyOwner) {
          // Check if password is double-hashed (longer than normal bcrypt hash)
          const isDoubleHashed = agencyOwner.password.length > 70;
          
          if (isDoubleHashed) {
            // Generate a simple password based on email
            const simplePassword = email.split('@')[0] + '123';
            
            // Hash the new password
            const hashedPassword = await bcrypt.hash(simplePassword, 12);

            // Update the password directly in the database
            await sequelize.query(
              'UPDATE agency_owners SET password = :password, updated_at = NOW() WHERE id = :id',
              {
                replacements: { password: hashedPassword, id: agencyOwner.id },
                type: sequelize.QueryTypes.UPDATE
              }
            );
          }
        }
      }
    }
    
    next();
  } catch (error) {
    logger.error('Error in agency password fix middleware:', error);
    next(); // Continue even if this middleware fails
  }
};

module.exports = fixAgencyPassword;
