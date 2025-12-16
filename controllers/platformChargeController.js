const PlatformCharge = require('../models/PlatformCharge');
const { ErrorHandler } = require('../utils/errorHandler');
const { AgencyOwner } = require('../models');
const notificationService = require('../services/notificationService');
const logger = require('../utils/logger');

// Add or Update Platform Charge
exports.addOrUpdatePlatformCharge = async (req, res, next) => {
  try {
    const { amount } = req.body;

    if (amount === undefined || amount === null || amount < 0) {
      throw new ErrorHandler('Valid amount is required', 400);
    }

    // Find active platform charge
    let platformCharge = await PlatformCharge.findOne({ where: { isActive: true } });

    if (platformCharge) {
      // Update existing
      platformCharge.amount = amount;
      await platformCharge.save();
    } else {
      // Create new
      platformCharge = await PlatformCharge.create({
        amount: amount,
        isActive: true,
      });
    }

    // Emit socket event for real-time updates
    if (global.socketService) {
      global.socketService.emitPlatformChargeUpdated({
        id: platformCharge.id,
        amount: platformCharge.amount || 0,
        isActive: platformCharge.isActive,
        action: 'updated'
      });
    }

    // Send Firebase notification to all agency owners about platform charge update
    try {
      const agencyOwners = await AgencyOwner.findAll({
        where: { isActive: true },
        attributes: ['fcmToken']
      });
      const ownerTokens = agencyOwners.map(o => o.fcmToken).filter(token => token);
      
      if (ownerTokens.length > 0) {
        await notificationService.sendToMultipleDevices(
          ownerTokens,
          'Platform Charge Updated 💰',
          `Platform charge has been set to $${platformCharge.amount || 0} per order.`,
          { type: 'PLATFORM_CHARGE_UPDATED', chargeId: platformCharge.id, amount: platformCharge.amount }
        );
        logger.info(`Platform charge notification sent to ${ownerTokens.length} agency owners`);
      }
    } catch (notifError) {
      logger.error('Error sending platform charge notification:', notifError.message);
    }

    res.status(200).json({
      success: true,
      message: 'Platform charge saved successfully',
      data: {
        id: platformCharge.id,
        amount: platformCharge.amount || 0,
      },
    });
  } catch (error) {
    next(error);
  }
};

// Get Platform Charge
exports.getPlatformCharge = async (req, res, next) => {
  try {
    const platformCharge = await PlatformCharge.findOne({ where: { isActive: true } });

    if (!platformCharge) {
      return res.status(200).json({
        success: true,
        data: {
          id: null,
          amount: 0,
        },
      });
    }

    res.status(200).json({
      success: true,
      data: {
        id: platformCharge.id,
        amount: platformCharge.amount || 0,
      },
    });
  } catch (error) {
    next(error);
  }
};

// Delete Platform Charge
exports.deletePlatformCharge = async (req, res, next) => {
  try {
    const platformCharge = await PlatformCharge.findOne({ where: { isActive: true } });

    if (!platformCharge) {
      throw new ErrorHandler('No active platform charge found', 404);
    }

    const chargeData = {
      id: platformCharge.id,
      amount: platformCharge.amount || 0,
    };

    // Soft delete
    platformCharge.isActive = false;
    await platformCharge.save();

    // Emit socket event for real-time updates
    if (global.socketService) {
      global.socketService.emitPlatformChargeDeleted({
        ...chargeData,
        isActive: false,
        action: 'deleted'
      });
    }

    // Send Firebase notification to all agency owners about platform charge removal
    try {
      const agencyOwners = await AgencyOwner.findAll({
        where: { isActive: true },
        attributes: ['fcmToken']
      });
      const ownerTokens = agencyOwners.map(o => o.fcmToken).filter(token => token);
      
      if (ownerTokens.length > 0) {
        await notificationService.sendToMultipleDevices(
          ownerTokens,
          'Platform Charge Removed',
          'Platform charge has been removed. No platform fee will be applied to orders.',
          { type: 'PLATFORM_CHARGE_DELETED' }
        );
      }
    } catch (notifError) {
      logger.error('Error sending platform charge deletion notification:', notifError.message);
    }

    res.status(200).json({
      success: true,
      message: 'Platform charge deleted successfully',
    });
  } catch (error) {
    next(error);
  }
};
