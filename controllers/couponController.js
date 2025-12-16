const Coupon = require('../models/Coupon');
const { createError } = require('../utils/errorHandler');
const { Op } = require('sequelize');
const { User } = require('../models');
const notificationService = require('../services/notificationService');
const logger = require('../utils/logger');

// Add Coupon (Agency Owner)
exports.addCoupon = async (req, res, next) => {
  try {
    const { code, discountType, discountValue, minAmount, maxAmount, expiryDate, expiryTime } = req.body;
    
    // Get agency ID from authenticated user
    let agencyId;
    if (req.user.role === 'admin') {
      // Admin can specify agency
      agencyId = req.body.agencyId;
      if (!agencyId) {
        return next(createError(400, 'Agency ID is required for admin'));
      }
    } else if (req.user.role === 'agency_owner') {
      // Agency owner uses their own agency
      agencyId = req.user.agencyId;
      if (!agencyId) {
        return next(createError(400, 'Agency not linked to your account'));
      }
    } else {
      return next(createError(403, 'Unauthorized to create coupons'));
    }

    // Check if coupon code already exists
    const existingCoupon = await Coupon.findOne({ where: { code: code.toUpperCase() } });
    if (existingCoupon) {
      return next(createError(400, 'Coupon code already exists'));
    }

    // Validate discount value
    if (discountType === 'percentage' && discountValue > 100) {
      return next(createError(400, 'Percentage discount cannot exceed 100%'));
    }

    // Validate amount range
    if (maxAmount && maxAmount < minAmount) {
      return next(createError(400, 'Maximum amount must be greater than minimum amount'));
    }

    const coupon = await Coupon.create({
      code: code.toUpperCase(),
      discountType,
      discountValue,
      minAmount: minAmount || 0,
      maxAmount: maxAmount || null,
      expiryDate,
      expiryTime,
      agencyId,
      isActive: true,
    });

    // Emit socket event for real-time updates
    if (global.socketService) {
      global.socketService.emitCouponCreated({
        id: coupon.id,
        code: coupon.code,
        discountType: coupon.discountType,
        discountValue: coupon.discountValue,
        minAmount: coupon.minAmount,
        maxAmount: coupon.maxAmount,
        expiryDate: coupon.expiryDate,
        expiryTime: coupon.expiryTime,
        agencyId: coupon.agencyId,
        isActive: coupon.isActive,
        action: 'created'
      });
    }

    // Send Firebase notification to all customers about new coupon
    try {
      const customers = await User.findAll({ 
        where: { role: 'customer', isBlocked: false },
        attributes: ['fcmToken']
      });
      const customerTokens = customers.map(c => c.fcmToken).filter(token => token);
      
      if (customerTokens.length > 0) {
        const discountText = coupon.discountType === 'percentage' 
          ? `${coupon.discountValue}% OFF` 
          : `$${coupon.discountValue} OFF`;
        
        await notificationService.sendToMultipleDevices(
          customerTokens,
          'New Coupon Available! 🎁',
          `Use code "${coupon.code}" to get ${discountText} on your next order!`,
          { type: 'COUPON_CREATED', couponId: coupon.id, couponCode: coupon.code, agencyId: coupon.agencyId }
        );
        logger.info(`Coupon notification sent to ${customerTokens.length} customers`);
      }
    } catch (notifError) {
      logger.error('Error sending coupon notification:', notifError.message);
    }

    res.status(201).json({
      success: true,
      message: 'Coupon created successfully',
      data: {
        id: coupon.id,
        code: coupon.code,
        discountType: coupon.discountType,
        discountValue: coupon.discountValue,
        minAmount: coupon.minAmount,
        maxAmount: coupon.maxAmount,
        expiryDate: coupon.expiryDate,
        expiryTime: coupon.expiryTime,
        agencyId: coupon.agencyId,
        isActive: coupon.isActive,
      },
    });
  } catch (error) {
    next(error);
  }
};

// Get All Coupons (Agency Owner - their coupons only, Admin - all)
exports.getAllCoupons = async (req, res, next) => {
  try {
    const { page = 1, limit = 10, agencyId: queryAgencyId } = req.query;
    const offset = (page - 1) * limit;

    let whereClause = {};

    if (req.user.role === 'agency_owner') {
      // Agency owner can only see their own coupons
      whereClause.agencyId = req.user.agencyId;
    } else if (req.user.role === 'admin') {
      // Admin can filter by agency or see all
      if (queryAgencyId) {
        whereClause.agencyId = queryAgencyId;
      }
    }

    const coupons = await Coupon.findAndCountAll({
      where: whereClause,
      limit: parseInt(limit),
      offset: parseInt(offset),
      order: [['createdAt', 'DESC']],
      include: [
        {
          model: require('../models/Agency'),
          as: 'Agency',
          attributes: ['id', 'name', 'email'],
        },
      ],
    });

    const totalPages = Math.ceil(coupons.count / limit);

    res.status(200).json({
      success: true,
      data: {
        coupons: coupons.rows,
        pagination: {
          currentPage: parseInt(page),
          totalPages,
          totalItems: coupons.count,
          itemsPerPage: parseInt(limit),
        },
      },
    });
  } catch (error) {
    next(error);
  }
};

// Update Coupon
exports.updateCoupon = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { code, discountType, discountValue, minAmount, maxAmount, expiryDate, expiryTime, isActive } = req.body;

    const coupon = await Coupon.findByPk(id);
    if (!coupon) {
      return next(createError(404, 'Coupon not found'));
    }

    // Check permissions
    if (req.user.role === 'agency_owner' && coupon.agencyId !== req.user.agencyId) {
      return next(createError(403, 'You can only update your own agency coupons'));
    }

    // Check if updating code and it already exists
    if (code && code.toUpperCase() !== coupon.code) {
      const existingCoupon = await Coupon.findOne({ 
        where: { 
          code: code.toUpperCase(),
          id: { [Op.ne]: id },
        } 
      });
      if (existingCoupon) {
        return next(createError(400, 'Coupon code already exists'));
      }
    }

    // Validate discount value
    if (discountType === 'percentage' && discountValue > 100) {
      return next(createError(400, 'Percentage discount cannot exceed 100%'));
    }

    // Validate amount range
    if (maxAmount && maxAmount < minAmount) {
      return next(createError(400, 'Maximum amount must be greater than minimum amount'));
    }

    // Update fields
    if (code) coupon.code = code.toUpperCase();
    if (discountType) coupon.discountType = discountType;
    if (discountValue !== undefined) coupon.discountValue = discountValue;
    if (minAmount !== undefined) coupon.minAmount = minAmount;
    if (maxAmount !== undefined) coupon.maxAmount = maxAmount;
    if (expiryDate) coupon.expiryDate = expiryDate;
    if (expiryTime) coupon.expiryTime = expiryTime;
    if (isActive !== undefined) coupon.isActive = isActive;

    await coupon.save();

    // Emit socket event for real-time updates
    if (global.socketService) {
      global.socketService.emitCouponUpdated({
        id: coupon.id,
        code: coupon.code,
        discountType: coupon.discountType,
        discountValue: coupon.discountValue,
        minAmount: coupon.minAmount,
        maxAmount: coupon.maxAmount,
        expiryDate: coupon.expiryDate,
        expiryTime: coupon.expiryTime,
        agencyId: coupon.agencyId,
        isActive: coupon.isActive,
        action: 'updated'
      });
    }

    res.status(200).json({
      success: true,
      message: 'Coupon updated successfully',
      data: coupon,
    });
  } catch (error) {
    next(error);
  }
};

// Toggle Coupon Status (Active/Inactive)
exports.toggleCouponStatus = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { isActive } = req.body;

    const coupon = await Coupon.findByPk(id);
    if (!coupon) {
      return next(createError(404, 'Coupon not found'));
    }

    // Check permissions
    if (req.user.role === 'agency_owner' && coupon.agencyId !== req.user.agencyId) {
      return next(createError(403, 'You can only update your own agency coupons'));
    }

    coupon.isActive = isActive;
    await coupon.save();

    // Emit socket event for real-time updates
    if (global.socketService) {
      global.socketService.emitCouponStatusChanged({
        id: coupon.id,
        code: coupon.code,
        discountType: coupon.discountType,
        discountValue: coupon.discountValue,
        minAmount: coupon.minAmount,
        maxAmount: coupon.maxAmount,
        expiryDate: coupon.expiryDate,
        expiryTime: coupon.expiryTime,
        agencyId: coupon.agencyId,
        isActive: coupon.isActive,
        action: 'status-changed'
      });
    }

    // Send Firebase notification when coupon is activated
    if (isActive) {
      try {
        const customers = await User.findAll({ 
          where: { role: 'customer', isBlocked: false },
          attributes: ['fcmToken']
        });
        const customerTokens = customers.map(c => c.fcmToken).filter(token => token);
        
        if (customerTokens.length > 0) {
          const discountText = coupon.discountType === 'percentage' 
            ? `${coupon.discountValue}% OFF` 
            : `$${coupon.discountValue} OFF`;
          
          await notificationService.sendToMultipleDevices(
            customerTokens,
            'Coupon Activated! 🎉',
            `Coupon "${coupon.code}" is now active! Get ${discountText} on your order.`,
            { type: 'COUPON_ACTIVATED', couponId: coupon.id, couponCode: coupon.code, agencyId: coupon.agencyId }
          );
        }
      } catch (notifError) {
        logger.error('Error sending coupon activation notification:', notifError.message);
      }
    }

    res.status(200).json({
      success: true,
      message: `Coupon ${isActive ? 'activated' : 'deactivated'} successfully`,
      data: coupon,
    });
  } catch (error) {
    next(error);
  }
};

// Delete Coupon
exports.deleteCoupon = async (req, res, next) => {
  try {
    const { id } = req.params;

    const coupon = await Coupon.findByPk(id);
    if (!coupon) {
      return next(createError(404, 'Coupon not found'));
    }

    // Check permissions
    if (req.user.role === 'agency_owner' && coupon.agencyId !== req.user.agencyId) {
      return next(createError(403, 'You can only delete your own agency coupons'));
    }

    const couponData = {
      id: coupon.id,
      code: coupon.code,
      discountType: coupon.discountType,
      discountValue: coupon.discountValue,
      agencyId: coupon.agencyId,
    };

    await coupon.destroy();

    // Emit socket event for real-time updates
    if (global.socketService) {
      global.socketService.emitCouponDeleted({
        ...couponData,
        action: 'deleted'
      });
    }

    res.status(200).json({
      success: true,
      message: 'Coupon deleted successfully',
    });
  } catch (error) {
    next(error);
  }
};

// Get Active Coupons for Customer (by Agency)
exports.getCustomerCoupons = async (req, res, next) => {
  try {
    const { agencyId } = req.query;

    if (!agencyId) {
      return next(createError(400, 'Agency ID is required'));
    }

    const now = new Date();

    // Get all active coupons for this agency
    const coupons = await Coupon.findAll({
      where: {
        agencyId: agencyId,
        isActive: true,
      },
      attributes: ['id', 'code', 'discountType', 'discountValue', 'minAmount', 'maxAmount', 'expiryDate', 'expiryTime'],
      order: [['createdAt', 'DESC']],
    });

    // Filter out expired coupons and auto-deactivate them
    const validCoupons = [];
    for (const coupon of coupons) {
      const expiryDateTime = new Date(`${coupon.expiryDate} ${coupon.expiryTime}`);
      
      if (now > expiryDateTime) {
        // Auto-deactivate expired coupon
        await coupon.update({ isActive: false });
      } else {
        validCoupons.push({
          id: coupon.id,
          code: coupon.code,
          discountType: coupon.discountType,
          discountValue: coupon.discountValue,
          minAmount: coupon.minAmount,
          maxAmount: coupon.maxAmount,
          expiryDate: coupon.expiryDate,
          expiryTime: coupon.expiryTime,
        });
      }
    }

    res.status(200).json({
      success: true,
      data: {
        coupons: validCoupons,
      },
    });
  } catch (error) {
    next(error);
  }
};

// Apply Coupon (Customer)
exports.applyCoupon = async (req, res, next) => {
  try {
    const { code, amount, agencyId } = req.body;

    if (!code || !amount || amount <= 0) {
      return next(createError(400, 'Valid coupon code and amount are required'));
    }

    if (!agencyId) {
      return next(createError(400, 'Agency ID is required'));
    }

    // Find coupon
    const coupon = await Coupon.findOne({
      where: {
        code: code.toUpperCase(),
        agencyId: agencyId,
        isActive: true,
      },
    });

    if (!coupon) {
      return next(createError(400, 'Invalid or expired coupon code'));
    }

    // Check expiry date and time
    const now = new Date();
    const expiryDateTime = new Date(`${coupon.expiryDate} ${coupon.expiryTime}`);

    if (now > expiryDateTime) {
      // Auto-deactivate expired coupon
      await coupon.update({ isActive: false });
      return next(createError(400, 'Coupon has expired'));
    }

    // Check minimum amount
    if (amount < coupon.minAmount) {
      return next(createError(400, `Minimum amount required: $${coupon.minAmount}`));
    }

    // Check maximum amount
    if (coupon.maxAmount && amount > coupon.maxAmount) {
      return next(createError(400, `Maximum amount allowed: $${coupon.maxAmount}`));
    }

    // Calculate discount
    let discountAmount = 0;
    if (coupon.discountType === 'percentage') {
      discountAmount = (amount * parseFloat(coupon.discountValue)) / 100;
    } else {
      discountAmount = parseFloat(coupon.discountValue);
    }

    // Final amount cannot be negative
    const finalAmount = Math.max(0, amount - discountAmount);

    res.status(200).json({
      success: true,
      message: 'Coupon applied successfully',
      data: {
        couponCode: coupon.code,
        originalAmount: parseFloat(amount),
        discountType: coupon.discountType,
        discountValue: parseFloat(coupon.discountValue),
        discountAmount: parseFloat(discountAmount.toFixed(2)),
        finalAmount: parseFloat(finalAmount.toFixed(2)),
      },
    });
  } catch (error) {
    next(error);
  }
};
