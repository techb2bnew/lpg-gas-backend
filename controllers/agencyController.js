const { 
  Agency, 
  User, 
  AgencyOwner,
  DeliveryAgent,
  AgencyInventory,
  Order,
  Coupon,
  DeliveryCharge
} = require('../models');
const { createAgency, updateAgency } = require('../validations/agencyValidation');
const { createError } = require('../utils/errorHandler');
const logger = require('../utils/logger');
const crypto = require('crypto');
const bcrypt = require('bcrypt');
const notificationService = require('../services/notificationService');

// Admin guard helper
const ensureAdmin = async (userId) => {
  const admin = await User.findByPk(userId);
  if (!admin || admin.role !== 'admin') {
    throw createError(403, 'Only admin can perform this action');
  }
  return admin;
};

// Create agency and send confirmation email
const create = async (req, res, next) => {
  try {
    await ensureAdmin(req.user.userId);

    // Handle image upload if provided
    if (req.file) {
      req.body.profileImage = req.file.path; // Cloudinary URL
    }

    const { error, value } = createAgency.validate(req.body);
    if (error) return next(createError(400, error.details[0].message));

    // Unique email check for both Agency and AgencyOwner
    const agencyExists = await Agency.findOne({ where: { email: value.email } });
    if (agencyExists) return next(createError(400, 'Agency with this email already exists'));

    const ownerExists = await AgencyOwner.findOne({ where: { email: value.email } });
    if (ownerExists) return next(createError(400, 'Agency owner with this email already exists'));

    // Unique phone number check for both Agency and AgencyOwner
    const agencyPhoneExists = await Agency.findOne({ where: { phone: value.phone } });
    if (agencyPhoneExists) return next(createError(400, 'Agency with this phone number already exists'));

    const ownerPhoneExists = await AgencyOwner.findOne({ where: { phone: value.phone } });
    if (ownerPhoneExists) return next(createError(400, 'Agency owner with this phone number already exists'));

    const token = crypto.randomBytes(24).toString('hex');
    const confirmationExpiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

    // Use database transaction to ensure atomicity
    const { sequelize } = require('../config/database');
    const transaction = await sequelize.transaction();

    try {
      const agency = await Agency.create({
        ...value,
        status: 'active',
        confirmationToken: null,
        confirmationExpiresAt: null
      }, { transaction });

      // Generate random password for agency owner
      const randomPassword = crypto.randomBytes(8).toString('hex');
      
      // Create agency owner automatically (password will be hashed by beforeCreate hook)
      const agencyOwner = await AgencyOwner.create({
        name: agency.name + ' Owner',
        email: agency.email,
        password: randomPassword,
        phone: agency.phone,
        agencyId: agency.id,
        address: agency.address,
        city: agency.city,
        pincode: agency.pincode,
        state: 'Delhi', // Default state
        isActive: true,
        isEmailVerified: true,
        confirmationToken: null,
        confirmationTokenExpires: null,
        profileImage: value.profileImage || null // Set agency image as owner's profile image
      }, { transaction });

      // Update agency with owner
      await agency.update({
        ownerId: agencyOwner.id
      }, { transaction });

      // Commit transaction
      await transaction.commit();

      // Create compact professional email template with inline CSS for email client compatibility
      const emailTemplate = `
        <!DOCTYPE html>
        <html lang="en">
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title style="margin: 0 0 8px 0; font-size: 24px; font-weight: bold; color: #1a202c; letter-spacing: -0.5px;">Welcome to LPG Gas Platform</title>
        </head>
        <body style="margin: 0; padding: 0; background-color: #f5f7fa; font-family: Arial, sans-serif;">
          <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f5f7fa; padding: 15px;">
            <tr>
              <td align="center">
                <table width="600" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 12px; box-shadow: 0 8px 25px rgba(0, 0, 0, 0.1); overflow: hidden;">
                  <!-- Content -->
                  <tr>
                    <td style="padding: 10px;">
                      
                      <!-- Welcome Section -->
                      <div style="text-align: center; margin-bottom: 15px;">
                        <h2 style="margin: 0 0 6px 0; font-size: 24px; font-weight: bold; color: #1a202c; letter-spacing: -0.5px;">Welcome ${agency.name}! 🎉</h2>
                        <p style="margin: 0; font-size: 16px; color: #718096;">Your agency has been successfully registered and is ready to use</p>
                      </div>
                      
                      <!-- Agency Information Card -->
                      <div style="background: linear-gradient(135deg, #f7fafc 0%, #edf2f7 100%); border-radius: 8px; padding: 18px; margin: 15px 0; border: 1px solid #e2e8f0;">
                        <h3 style="margin: 0 0 12px 0; font-size: 18px; font-weight: bold; color: #2d3748;">🏢 Agency Information</h3>
                        
                        <table width="100%" cellpadding="0" cellspacing="0">
                          <tr>
                            <td style="padding: 6px 0; border-bottom: 1px solid #e2e8f0;">
                              <table width="100%" cellpadding="0" cellspacing="0">
                                <tr>
                                  <td style="font-weight: bold; color: #4a5568; font-size: 14px; width: 35%;">Agency Name</td>
                                  <td style="color: #2d3748; font-weight: bold; font-size: 14px;">${agency.name}</td>
                                </tr>
                              </table>
                            </td>
                          </tr>
                          <tr>
                            <td style="padding: 6px 0; border-bottom: 1px solid #e2e8f0;">
                              <table width="100%" cellpadding="0" cellspacing="0">
                                <tr>
                                  <td style="font-weight: bold; color: #4a5568; font-size: 14px; width: 35%;">Email Address</td>
                                  <td style="color: #2d3748; font-weight: bold; font-size: 14px;">${agency.email}</td>
                                </tr>
                              </table>
                            </td>
                          </tr>
                          <tr>
                            <td style="padding: 6px 0; border-bottom: 1px solid #e2e8f0;">
                              <table width="100%" cellpadding="0" cellspacing="0">
                                <tr>
                                  <td style="font-weight: bold; color: #4a5568; font-size: 14px; width: 35%;">Phone Number</td>
                                  <td style="color: #2d3748; font-weight: bold; font-size: 14px;">${agency.phone}</td>
                                </tr>
                              </table>
                            </td>
                          </tr>
                          <tr>
                            <td style="padding: 8px 0;">
                              <table width="100%" cellpadding="0" cellspacing="0">
                                <tr>
                                  <td style="font-weight: bold; color: #4a5568; font-size: 14px; width: 35%;">Location</td>
                                  <td style="color: #2d3748; font-weight: bold; font-size: 14px;">${agency.address}, ${agency.city} - ${agency.pincode}</td>
                                </tr>
                              </table>
                            </td>
                          </tr>
                        </table>
                      </div>
                      
                      <!-- Credentials Card -->
                      <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); border-radius: 8px; padding: 18px; margin: 15px 0; color: white;">
                        <h3 style="margin: 0 0 12px 0; font-size: 18px; font-weight: bold;">🔐 Your Login Credentials</h3>
                        
                        <table width="100%" cellpadding="0" cellspacing="0">
                          <tr>
                            <td style="padding: 8px 0; border-bottom: 1px solid rgba(255, 255, 255, 0.2);">
                              <table width="100%" cellpadding="0" cellspacing="0">
                                <tr>
                                  <td style="font-weight: bold; font-size: 14px; width: 20%; color:black;">Email</td>
                                  <td style="background-color: rgba(255, 255, 255, 0.15); padding: 8px 12px; border-radius: 6px; border: 1px solid rgba(255, 255, 255, 0.2); font-family: monospace; font-size: 13px; font-weight: bold; margin: 0 10px;color:black;">${agency.email}</td>
                                 
                                </tr>
                              </table>
                            </td>
                          </tr>
                          <tr>
                            <td style="padding: 8px 0;">
                              <table width="100%" cellpadding="0" cellspacing="0">
                                <tr>
                                  <td style="font-weight: bold; font-size: 14px; width: 20%; color:black;">Password</td>
                                  <td style="background-color: rgba(255, 255, 255, 0.15); padding: 8px 12px; border-radius: 6px; border: 1px solid rgba(255, 255, 255, 0.2); font-family: monospace; font-size: 13px; font-weight: bold; margin: 0 10px;color:black;">${randomPassword}</td>
                                </tr>
                              </table>
                            </td>
                          </tr>
                        </table>
                      </div>
                      
                      <!-- Login Button -->
                      <div style="text-align: center; margin: 18px 0;">
                        <a href="https://lpg-gas-admin-agency.vercel.app/login" style="display: inline-block; background: linear-gradient(135deg, #48bb78 0%, #38a169 100%); color: white; padding: 15px 30px; text-decoration: none; border-radius: 8px; font-weight: bold; font-size: 15px; box-shadow: 0 4px 15px rgba(72, 187, 120, 0.3);color:black;">🚀 Access Your Dashboard</a>
                      </div>
                      
                      <!-- Security Section -->
                      <div style="background: linear-gradient(135deg, #fef5e7 0%, #fed7aa 100%); border: 1px solid #f6ad55; border-radius: 8px; padding: 15px; margin: 15px 0;">
                        <h4 style="margin: 0 0 8px 0; color: #c05621; font-size: 15px; font-weight: bold;">🛡️ Security Reminders</h4>
                        <ul style="color: #c05621; margin: 0; padding-left: 18px;">
                          <li style="margin-bottom: 4px; font-size: 13px; line-height: 1.4;">Change your password immediately after first login</li>
                          <li style="margin-bottom: 4px; font-size: 13px; line-height: 1.4;">Keep your login credentials secure and confidential</li>
                          <li style="margin-bottom: 4px; font-size: 13px; line-height: 1.4;">Contact our support team if you need any assistance</li>
                          <li style="margin-bottom: 0; font-size: 13px; line-height: 1.4;">Regularly update your profile information</li>
        </ul>
                      </div>
                      
                    </td>
                  </tr>
                  
                  <!-- Footer -->
                  <tr>
                    <td style="background-color: #2d3748; color: white; padding: 25px; text-align: center;">
                      <p style="margin: 0; color: #a0aec0; font-size: 13px;">Best regards,</p>
                      <p style="margin: 5px 0 0 0; color: white; font-weight: bold; font-size: 14px;">LPG Gas Platform Team</p>
                      <p style="margin: 15px 0 0 0; font-size: 11px; color: #718096;">This is an automated message. Please do not reply to this email.</p>
                    </td>
                  </tr>
                  
                </table>
              </td>
            </tr>
          </table>
        </body>
        </html>
      `;

      // Emit socket notification
      const socketService = global.socketService;
      if (socketService) {
        socketService.emitAgencyCreated({
          id: agency.id,
          name: agency.name,
          email: agency.email,
          city: agency.city,
          status: agency.status,
          createdBy: req.user.email || 'admin'
        });
      }

      // Send Firebase notification to all admins about new agency
      try {
        const admins = await User.findAll({ where: { role: 'admin' } });
        const adminTokens = admins.map(admin => admin.fcmToken).filter(token => token);
        if (adminTokens.length > 0) {
          await notificationService.sendToMultipleDevices(
            adminTokens,
            'New Agency Created!',
            `Agency "${agency.name}" has been created in ${agency.city}.`,
            { type: 'AGENCY_CREATED', agencyId: agency.id, agencyName: agency.name },
            {
              recipientType: 'multiple',
              agencyId: agency.id,
              notificationType: 'CUSTOM'
            }
          );
        }
      } catch (notifError) {
        logger.error('Error sending agency created notification:', notifError.message);
      }

      // Send response first
      res.status(201).json({
        success: true,
        message: 'Agency created and activated successfully. Login credentials sent to agency email.',
        data: {
          agency: agency,
          owner: {
            id: agencyOwner.id,
            email: agencyOwner.email,
            name: agencyOwner.name
          },
          loginUrl: `${process.env.FRONTEND_URL || 'http://localhost:3000'}/agency/login`,
          credentials: {
            email: agency.email,
            password: randomPassword
          }
        }
      });

      // Send email after response (outside transaction)
      try {
        if (process.env.EMAIL_HOST && process.env.EMAIL_USER) {
          // Send email directly using nodemailer
          const nodemailer = require('nodemailer');
          
          const transporter = nodemailer.createTransport({
            host: process.env.EMAIL_HOST,
            port: process.env.EMAIL_PORT,
            secure: false,
            auth: {
              user: process.env.EMAIL_USER,
              pass: process.env.EMAIL_PASSWORD
            }
          });

          await transporter.sendMail({
            from: process.env.EMAIL_USER,
            to: agency.email,
            subject: '🚀 Welcome to LPG Gas Platform - Your Agency is Ready!',
            html: emailTemplate
          });

        } 
      } catch (emailError) {
        logger.error(`Email sending failed: ${emailError.message}`);
        // Don't throw error here as agency is already created
      }

    } catch (transactionError) {
      // Rollback transaction on error
      await transaction.rollback();
      return next(createError(500, 'Failed to create agency and owner'));
    }
  } catch (error) { 
    next(error); 
  }
};

// Confirm agency by token
const confirm = async (req, res, next) => {
  try {
    const { token } = req.query;
    if (!token) {
      return res.status(400).send(`
        <html>
          <head><title>Agency Confirmation</title></head>
          <body style="font-family: Arial, sans-serif; text-align: center; padding: 50px;">
            <h2 style="color: #e74c3c;">Error</h2>
            <p>Token is required for confirmation.</p>
          </body>
        </html>
      `);
    }

    const agency = await Agency.findOne({ where: { confirmationToken: token } });
    if (!agency) {
      return res.status(400).send(`
        <html>
          <head><title>Agency Confirmation</title></head>
          <body style="font-family: Arial, sans-serif; text-align: center; padding: 50px;">
            <h2 style="color: #e74c3c;">Invalid Token</h2>
            <p>The confirmation link is invalid or has already been used.</p>
          </body>
        </html>
      `);
    }

    if (agency.status === 'active') {
      return res.status(200).send(`
        <html>
          <head><title>Agency Confirmation</title></head>
          <body style="font-family: Arial, sans-serif; text-align: center; padding: 50px;">
            <h2 style="color: #27ae60;">Already Confirmed</h2>
            <p>Your agency "${agency.name}" is already active and confirmed.</p>
          </body>
        </html>
      `);
    }

    if (agency.confirmationExpiresAt && new Date() > new Date(agency.confirmationExpiresAt)) {
      return res.status(400).send(`
        <html>
          <head><title>Agency Confirmation</title></head>
          <body style="font-family: Arial, sans-serif; text-align: center; padding: 50px;">
            <h2 style="color: #e74c3c;">Link Expired</h2>
            <p>The confirmation link has expired. Please contact admin for a new link.</p>
          </body>
        </html>
      `);
    }

    await agency.update({ status: 'active', confirmationToken: null, confirmationExpiresAt: null });

    // Also activate the agency owner
    if (agency.ownerId) {
      await AgencyOwner.update(
        { 
          isActive: true, 
          isEmailVerified: true,
          confirmationToken: null,
          confirmationTokenExpires: null
        },
        { where: { id: agency.ownerId } }
      );

      // Send Firebase notification to agency owner about confirmation
      try {
        const agencyOwner = await AgencyOwner.findByPk(agency.ownerId);
        if (agencyOwner && agencyOwner.fcmToken) {
          await notificationService.sendToDevice(
            agencyOwner.fcmToken,
            'Agency Confirmed! 🎉',
            `Your agency "${agency.name}" has been confirmed and is now active.`,
            { type: 'AGENCY_CONFIRMED', agencyId: agency.id, agencyName: agency.name },
            {
              recipientType: 'agency',
              recipientId: agency.id,
              agencyId: agency.id,
              notificationType: 'CUSTOM'
            }
          );
        }
      } catch (notifError) {
        logger.error('Error sending agency confirmation notification:', notifError.message);
      }
    }


    res.status(200).send(`
      <html>
        <head><title>Agency Confirmation</title></head>
        <body style="font-family: Arial, sans-serif; text-align: center; padding: 50px;">
          <div style="max-width: 500px; margin: 0 auto; background: #f8f9fa; padding: 30px; border-radius: 10px;">
            <h2 style="color: #27ae60;">✅ Confirmation Successful!</h2>
            <p><strong>Thank you for confirming your agency!</strong></p>
            <p>Your agency "<strong>${agency.name}</strong>" has been successfully activated.</p>
            <p>You can now start using our services.</p>
            <div style="margin-top: 30px; padding: 20px; background: #e8f5e8; border-radius: 5px;">
              <p style="margin: 0; color: #27ae60;"><strong>Status: Active</strong></p>
            </div>
          </div>
        </body>
      </html>
    `);
  } catch (error) { 
    logger.error(`Agency confirmation error: ${error.message}`);
    res.status(500).send(`
      <html>
        <head><title>Agency Confirmation</title></head>
        <body style="font-family: Arial, sans-serif; text-align: center; padding: 50px;">
          <h2 style="color: #e74c3c;">Server Error</h2>
          <p>Something went wrong. Please try again later.</p>
        </body>
      </html>
    `);
  }
};

// List agencies with pagination and search
const list = async (req, res, next) => {
  try {
    await ensureAdmin(req.user.userId);

    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const offset = (page - 1) * limit;
    const search = req.query.search || '';
    const status = req.query.status || '';

    const { Op } = require('sequelize');
    const where = {};
    if (search) {
      where[Op.or] = [
        { name: { [Op.iLike]: `%${search}%` } },
        { email: { [Op.iLike]: `%${search}%` } },
        { phone: { [Op.iLike]: `%${search}%` } },
        { city: { [Op.iLike]: `%${search}%` } }
      ];
    }
    if (status && ['active', 'inactive'].includes(status)) where.status = status;

    const { count, rows } = await Agency.findAndCountAll({ where, order: [['createdAt', 'DESC']], limit, offset });

    res.status(200).json({
      success: true,
      data: {
        agencies: rows,
        pagination: { currentPage: page, totalPages: Math.ceil(count / limit), total: count, limit }
      }
    });
  } catch (error) { next(error); }
};

// List only active agencies (public endpoint - no auth required)
const listActive = async (req, res, next) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const offset = (page - 1) * limit;
    const search = req.query.search || '';

    const { Op } = require('sequelize');
    const where = { status: 'active' };
    
    if (search) {
      where[Op.and] = [
        { status: 'active' },
        {
          [Op.or]: [
            { name: { [Op.iLike]: `%${search}%` } },
            { email: { [Op.iLike]: `%${search}%` } },
            { phone: { [Op.iLike]: `%${search}%` } },
            { city: { [Op.iLike]: `%${search}%` } }
          ]
        }
      ];
    }

    const { count, rows } = await Agency.findAndCountAll({ 
      where, 
      order: [['createdAt', 'DESC']], 
      limit, 
      offset,
      attributes: ['id', 'name', 'email', 'phone', 'addressTitle', 'address', 'city', 'pincode', 'landmark', 'profileImage', 'status', 'createdAt'] // Exclude sensitive fields
    });

    // Transform the response to include agencyId field
    const agenciesWithId = rows.map(agency => ({
      ...agency.toJSON(),
      agencyId: agency.id // Add agencyId field for frontend convenience
    }));

    res.status(200).json({
      success: true,
      data: {
        agencies: agenciesWithId,
        pagination: { currentPage: page, totalPages: Math.ceil(count / limit), total: count, limit }
      }
    });
  } catch (error) { next(error); }
};

// Get single agency
const getById = async (req, res, next) => {
  try {
    await ensureAdmin(req.user.userId);
    const agency = await Agency.findByPk(req.params.id);
    if (!agency) return next(createError(404, 'Agency not found'));
    res.status(200).json({ success: true, data: agency });
  } catch (error) { next(error); }
};

// Update agency
const update = async (req, res, next) => {
  try {
    await ensureAdmin(req.user.userId);
    
    // Handle image upload if provided
    if (req.file) {
      req.body.profileImage = req.file.path; // Cloudinary URL
    }
    
    const { error, value } = updateAgency.validate(req.body);
    if (error) return next(createError(400, error.details[0].message));

    const agency = await Agency.findByPk(req.params.id);
    if (!agency) return next(createError(404, 'Agency not found'));

    // If email is changing, ensure uniqueness
    if (value.email && value.email !== agency.email) {
      const exists = await Agency.findOne({ where: { email: value.email } });
      if (exists) return next(createError(400, 'Agency with this email already exists'));
      
      // Check if agency owner with new email already exists
      const ownerExists = await AgencyOwner.findOne({ where: { email: value.email } });
      if (ownerExists) return next(createError(400, 'Agency owner with this email already exists'));
      
      // Email is changing - generate new confirmation token and send email
      const token = crypto.randomBytes(24).toString('hex');
      const confirmationExpiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
      
      // Generate new password for agency owner
      const newPassword = crypto.randomBytes(8).toString('hex');
      
      // Use transaction to update both agency and agency owner
      const { sequelize } = require('../config/database');
      const transaction = await sequelize.transaction();
      
      try {
        // Update agency with new email and reset confirmation status
        await agency.update({
          ...value,
          email: value.email,
          status: 'inactive', // Reset to inactive when email changes
          confirmationToken: token,
          confirmationExpiresAt
        }, { transaction });
        
        // Update agency owner with new email and password
        const agencyOwner = await AgencyOwner.findOne({ 
          where: { agencyId: agency.id },
          transaction 
        });
        
        if (agencyOwner) {
          await agencyOwner.update({
            email: value.email,
            password: newPassword,
            isEmailVerified: false, // Reset email verification status
            confirmationToken: null,
            confirmationTokenExpires: null
          }, { transaction });
        }
        
        // If profileImage was updated, also update the agency owner's profile image
        if (value.profileImage && agencyOwner) {
          await agencyOwner.update(
            { profileImage: value.profileImage },
            { transaction }
          );
        }
        
        await transaction.commit();
        
        // Create email template for new credentials
        const emailTemplate = `
          <!DOCTYPE html>
          <html lang="en">
          <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title style="margin: 0 0 8px 0; font-size: 24px; font-weight: bold; color: #1a202c; letter-spacing: -0.5px;">Agency Email Updated - New Login Credentials</title>
          </head>
          <body style="margin: 0; padding: 0; background-color: #f5f7fa; font-family: Arial, sans-serif;">
            <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f5f7fa; padding: 15px;">
              <tr>
                <td align="center">
                  <table width="600" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 12px; box-shadow: 0 8px 25px rgba(0, 0, 0, 0.1); overflow: hidden;">
                    <!-- Content -->
                    <tr>
                      <td style="padding: 10px;">
                        
                        <!-- Update Section -->
                        <div style="text-align: center; margin-bottom: 15px;">
                          <h2 style="margin: 0 0 6px 0; font-size: 24px; font-weight: bold; color: #1a202c; letter-spacing: -0.5px;">Agency Email Updated! 📧</h2>
                          <p style="margin: 0; font-size: 16px; color: #718096;">Your agency email has been updated with new login credentials</p>
                        </div>
                        
                        <!-- Agency Information Card -->
                        <div style="background: linear-gradient(135deg, #f7fafc 0%, #edf2f7 100%); border-radius: 8px; padding: 18px; margin: 15px 0; border: 1px solid #e2e8f0;">
                          <h3 style="margin: 0 0 12px 0; font-size: 18px; font-weight: bold; color: #2d3748;">🏢 Agency Information</h3>
                          
                          <table width="100%" cellpadding="0" cellspacing="0">
                            <tr>
                              <td style="padding: 6px 0; border-bottom: 1px solid #e2e8f0;">
                                <table width="100%" cellpadding="0" cellspacing="0">
                                  <tr>
                                    <td style="font-weight: bold; color: #4a5568; font-size: 14px; width: 35%;">Agency Name</td>
                                    <td style="color: #2d3748; font-weight: bold; font-size: 14px;">${agency.name}</td>
                                  </tr>
                                </table>
                              </td>
                            </tr>
                            <tr>
                              <td style="padding: 6px 0; border-bottom: 1px solid #e2e8f0;">
                                <table width="100%" cellpadding="0" cellspacing="0">
                                  <tr>
                                    <td style="font-weight: bold; color: #4a5568; font-size: 14px; width: 35%;">New Email Address</td>
                                    <td style="color: #2d3748; font-weight: bold; font-size: 14px;">${value.email}</td>
                                  </tr>
                                </table>
                              </td>
                            </tr>
                            <tr>
                              <td style="padding: 6px 0; border-bottom: 1px solid #e2e8f0;">
                                <table width="100%" cellpadding="0" cellspacing="0">
                                  <tr>
                                    <td style="font-weight: bold; color: #4a5568; font-size: 14px; width: 35%;">Phone Number</td>
                                    <td style="color: #2d3748; font-weight: bold; font-size: 14px;">${agency.phone}</td>
                                  </tr>
                                </table>
                              </td>
                            </tr>
                            <tr>
                              <td style="padding: 8px 0;">
                                <table width="100%" cellpadding="0" cellspacing="0">
                                  <tr>
                                    <td style="font-weight: bold; color: #4a5568; font-size: 14px; width: 35%;">Location</td>
                                    <td style="color: #2d3748; font-weight: bold; font-size: 14px;">${agency.address}, ${agency.city} - ${agency.pincode}</td>
                                  </tr>
                                </table>
                              </td>
                            </tr>
                          </table>
                        </div>
                        
                        <!-- New Credentials Card -->
                        <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); border-radius: 8px; padding: 18px; margin: 15px 0; color: white;">
                          <h3 style="margin: 0 0 12px 0; font-size: 18px; font-weight: bold;">🔐 Your New Login Credentials</h3>
                          
                          <table width="100%" cellpadding="0" cellspacing="0">
                            <tr>
                              <td style="padding: 8px 0; border-bottom: 1px solid rgba(255, 255, 255, 0.2);">
                                <table width="100%" cellpadding="0" cellspacing="0">
                                  <tr>
                                    <td style="font-weight: bold; font-size: 14px; width: 20%; color:black;">Email</td>
                                    <td style="background-color: rgba(255, 255, 255, 0.15); padding: 8px 12px; border-radius: 6px; border: 1px solid rgba(255, 255, 255, 0.2); font-family: monospace; font-size: 13px; font-weight: bold; margin: 0 10px;color:black;">${value.email}</td>
                                  </tr>
                                </table>
                              </td>
                            </tr>
                            <tr>
                              <td style="padding: 8px 0;">
                                <table width="100%" cellpadding="0" cellspacing="0">
                                  <tr>
                                    <td style="font-weight: bold; font-size: 14px; width: 20%; color:black;">Password</td>
                                    <td style="background-color: rgba(255, 255, 255, 0.15); padding: 8px 12px; border-radius: 6px; border: 1px solid rgba(255, 255, 255, 0.2); font-family: monospace; font-size: 13px; font-weight: bold; margin: 0 10px;color:black;">${newPassword}</td>
                                  </tr>
                                </table>
                              </td>
                            </tr>
                          </table>
                        </div>
                        
                        <!-- Login Button -->
                        <div style="text-align: center; margin: 18px 0;">
                          <a href="https://lpg-gas-admin-agency.vercel.app/login" style="display: inline-block; background: linear-gradient(135deg, #48bb78 0%, #38a169 100%); color: white; padding: 15px 30px; text-decoration: none; border-radius: 8px; font-weight: bold; font-size: 15px; box-shadow: 0 4px 15px rgba(72, 187, 120, 0.3);color:black;">🚀 Access Your Dashboard</a>
                        </div>
                        
                        <!-- Security Section -->
                        <div style="background: linear-gradient(135deg, #fef5e7 0%, #fed7aa 100%); border: 1px solid #f6ad55; border-radius: 8px; padding: 15px; margin: 15px 0;">
                          <h4 style="margin: 0 0 8px 0; color: #c05621; font-size: 15px; font-weight: bold;">🛡️ Security Reminders</h4>
                          <ul style="color: #c05621; margin: 0; padding-left: 18px;">
                            <li style="margin-bottom: 4px; font-size: 13px; line-height: 1.4;">Your agency email has been updated successfully</li>
                            <li style="margin-bottom: 4px; font-size: 13px; line-height: 1.4;">Please use the new credentials to login</li>
                            <li style="margin-bottom: 4px; font-size: 13px; line-height: 1.4;">Change your password after first login for security</li>
                            <li style="margin-bottom: 4px; font-size: 13px; line-height: 1.4;">Keep your login credentials secure and confidential</li>
                            <li style="margin-bottom: 0; font-size: 13px; line-height: 1.4;">Contact our support team if you need any assistance</li>
                          </ul>
                        </div>
                        
                      </td>
                    </tr>
                    
                    <!-- Footer -->
                    <tr>
                      <td style="background-color: #2d3748; color: white; padding: 25px; text-align: center;">
                        <p style="margin: 0; color: #a0aec0; font-size: 13px;">Best regards,</p>
                        <p style="margin: 5px 0 0 0; color: white; font-weight: bold; font-size: 14px;">LPG Gas Platform Team</p>
                        <p style="margin: 15px 0 0 0; font-size: 11px; color: #718096;">This is an automated message. Please do not reply to this email.</p>
                      </td>
                    </tr>
                    
                  </table>
                </td>
              </tr>
            </table>
          </body>
          </html>
        `;

        // Send email with new credentials
        try {
          if (process.env.EMAIL_HOST && process.env.EMAIL_USER) {
            // Send email directly using nodemailer
            const nodemailer = require('nodemailer');
            
            const transporter = nodemailer.createTransport({
              host: process.env.EMAIL_HOST,
              port: process.env.EMAIL_PORT,
              secure: false,
              auth: {
                user: process.env.EMAIL_USER,
                pass: process.env.EMAIL_PASSWORD
              }
            });

            await transporter.sendMail({
              from: process.env.EMAIL_USER,
              to: value.email,
              subject: '📧 Agency Email Updated - New Login Credentials',
              html: emailTemplate
            });

            logger.info(`Email with new credentials sent successfully to: ${value.email}`);
          } else {
            logger.info(`Agency email updated: ${agency.email} -> ${value.email} (Email skipped - no email server configured)`);
          }
        } catch (emailError) {
          logger.error(`Email sending failed: ${emailError.message}`);
          // Don't throw error here as agency is already updated
        }

        logger.info(`Agency email changed: ${agency.email} -> ${value.email}. New credentials sent.`);

        res.status(200).json({ 
          success: true, 
          message: 'Agency updated. New login credentials sent to the updated email address.', 
          data: {
            ...agency.toJSON(),
            email: value.email
          },
          credentials: {
            email: value.email,
            password: newPassword
          }
        });

      } catch (transactionError) {
        // Rollback transaction on error
        await transaction.rollback();
        logger.error(`Transaction failed: ${transactionError.message}`);
        return next(createError(500, 'Failed to update agency email and credentials'));
      }
    } else {
      // No email change - normal update
      await agency.update(value);
      
      // If profileImage was updated, also update the agency owner's profile image
      if (value.profileImage) {
        const { AgencyOwner } = require('../models');
        await AgencyOwner.update(
          { profileImage: value.profileImage },
          { where: { agencyId: agency.id } }
        );
      }

      // Send Firebase notification to agency owner about update
      try {
        const agencyOwner = await AgencyOwner.findOne({ where: { agencyId: agency.id } });
        if (agencyOwner && agencyOwner.fcmToken) {
          await notificationService.sendToDevice(
            agencyOwner.fcmToken,
            'Agency Updated',
            `Your agency "${agency.name}" profile has been updated by admin.`,
            { type: 'AGENCY_UPDATED', agencyId: agency.id, agencyName: agency.name },
            {
              recipientType: 'agency',
              recipientId: agency.id,
              agencyId: agency.id,
              notificationType: 'CUSTOM'
            }
          );
        }
      } catch (notifError) {
        logger.error('Error sending agency update notification:', notifError.message);
      }
      
      res.status(200).json({ success: true, message: 'Agency updated', data: agency });
    }
  } catch (error) { next(error); }
};

// Update agency status
const updateStatus = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    // Validate status
    if (!status || !['active', 'inactive'].includes(status)) {
      return next(createError(400, 'Status must be either active or inactive'));
    }

    const agency = await Agency.findByPk(id);
    if (!agency) {
      return next(createError(404, 'Agency not found'));
    }

    // Check permissions
    const userRole = req.user.role;
    
    if (userRole === 'admin') {
      // Admin can update any agency status
      await agency.update({ status });
      
      // Also update agency owner status
      if (agency.ownerId) {
        await AgencyOwner.update(
          { isActive: status === 'active' },
          { where: { id: agency.ownerId } }
        );
      }

      logger.info(`Admin updated agency status: ${agency.email} -> ${status}`);

      // Send Firebase notification to agency owner about status change
      try {
        const agencyOwner = await AgencyOwner.findOne({ where: { agencyId: agency.id } });
        if (agencyOwner && agencyOwner.fcmToken) {
          const statusMessage = status === 'active' 
            ? `Your agency "${agency.name}" has been activated.`
            : `Your agency "${agency.name}" has been deactivated. Please contact admin.`;
          
          await notificationService.sendToDevice(
            agencyOwner.fcmToken,
            status === 'active' ? 'Agency Activated! ✅' : 'Agency Deactivated ⚠️',
            statusMessage,
            { type: 'AGENCY_STATUS_CHANGED', agencyId: agency.id, status: status },
            {
              recipientType: 'agency',
              recipientId: agency.id,
              agencyId: agency.id,
              notificationType: 'CUSTOM'
            }
          );
        }
      } catch (notifError) {
        logger.error('Error sending agency status notification:', notifError.message);
      }
      
      // Emit socket notification for agency status change
      const socketService = global.socketService;
      if (socketService) {
        // Prepare complete agency data for real-time updates
        const agencyUpdateData = {
          id: agency.id,
          name: agency.name,
          email: agency.email,
          phone: agency.phone,
          address: agency.address,
          city: agency.city,
          pincode: agency.pincode,
          profileImage: agency.profileImage,
          status: agency.status,
          updatedBy: req.user.email || 'admin',
          statusChanged: true
        };

        socketService.emitAgencyUpdated(agencyUpdateData);

        // If agency is deactivated, notify agency owner to logout
        if (status === 'inactive') {
          socketService.sendToUserByEmail(agency.email, 'agency:force-logout', {
            type: 'AGENCY_DEACTIVATED',
            message: 'Your agency has been deactivated by admin. You will be logged out.',
            timestamp: new Date()
          }, 'agency_owner');
        }
      }
      
      res.status(200).json({
        success: true,
        message: `Agency status updated to ${status}`,
        data: {
          id: agency.id,
          name: agency.name,
          email: agency.email,
          status: agency.status
        }
      });

    } else if (userRole === 'agency_owner') {
      // Agency owner can only update their own agency status
      if (req.user.agencyId !== agency.id) {
        return next(createError(403, 'You can only update your own agency status'));
      }

      // Agency owner can only activate their agency (not deactivate)
      if (status === 'inactive') {
        return next(createError(403, 'You cannot deactivate your own agency. Please contact admin.'));
      }

      // Only allow activation if agency is currently inactive
      if (agency.status === 'active') {
        return next(createError(400, 'Agency is already active'));
      }

      await agency.update({ status: 'active' });
      
      // Also activate the agency owner
      if (agency.ownerId) {
        await AgencyOwner.update(
          { isActive: true },
          { where: { id: agency.ownerId } }
        );
      }

      logger.info(`Agency owner activated agency: ${agency.email}`);
      
      res.status(200).json({
        success: true,
        message: 'Agency activated successfully',
        data: {
          id: agency.id,
          name: agency.name,
          email: agency.email,
          status: agency.status
        }
      });

    } else {
      return next(createError(403, 'Access denied. Only admin and agency owners can update status'));
    }

  } catch (error) {
    next(error);
  }
};

// Delete agency
const remove = async (req, res, next) => {
  try {
    await ensureAdmin(req.user.userId);
    const agency = await Agency.findByPk(req.params.id);
    if (!agency) return next(createError(404, 'Agency not found'));

    // Prevent deletion when orders exist to preserve order history integrity
    const orderCount = await Order.count({ where: { agencyId: agency.id } });
    if (orderCount > 0) {
      return next(createError(400, 'Cannot delete agency with existing orders. Please reassign or archive orders first.'));
    }

    // Send Firebase notification to agency owner before deletion
    try {
      const agencyOwner = await AgencyOwner.findOne({ where: { agencyId: agency.id } });
      if (agencyOwner && agencyOwner.fcmToken) {
        await notificationService.sendToDevice(
          agencyOwner.fcmToken,
          'Agency Deleted',
          `Your agency "${agency.name}" has been deleted by admin.`,
          { type: 'AGENCY_DELETED', agencyId: agency.id, agencyName: agency.name },
          {
            recipientType: 'agency',
            recipientId: agency.id,
            agencyId: agency.id,
            notificationType: 'CUSTOM'
          }
        );
      }
    } catch (notifError) {
      logger.error('Error sending agency deletion notification:', notifError.message);
    }

    // Use transaction to delete both agency and agency owner
    const { sequelize } = require('../config/database');
    await sequelize.transaction(async (transaction) => {
      // Break circular reference before deleting owner
      if (agency.ownerId) {
        await agency.update({ ownerId: null }, { transaction });
      }

      // Clean up related records to avoid foreign key constraint issues
      await Promise.all([
        DeliveryAgent.destroy({ where: { agencyId: agency.id }, transaction }),
        AgencyInventory.destroy({ where: { agencyId: agency.id }, transaction }),
        Coupon.destroy({ where: { agencyId: agency.id }, transaction }),
        DeliveryCharge.destroy({ where: { agencyId: agency.id }, transaction })
      ]);

      // Delete all agency owners associated with this agency
      await AgencyOwner.destroy({ 
        where: { agencyId: agency.id }, 
        transaction 
      });

      // Delete agency
      await agency.destroy({ transaction });
    });

    logger.info(`Agency and owner deleted: ${agency.email}`);
    res.status(200).json({ success: true, message: 'Agency deleted' });
  } catch (error) { 
    next(error); 
  }
};

module.exports = {
  create,
  confirm,
  list,
  listActive,
  getById,
  update,
  updateStatus,
  remove
};


