const Tax = require('../models/Tax');
const PlatformCharge = require('../models/PlatformCharge');
const { ErrorHandler } = require('../utils/errorHandler');

// Add or Update Tax Configuration
exports.addOrUpdateTax = async (req, res, next) => {
  try {
    const { percentage, fixedAmount } = req.body;

    // Check if both are provided
    if (percentage !== undefined && percentage !== null && 
        fixedAmount !== undefined && fixedAmount !== null) {
      throw new ErrorHandler('Only one of percentage or fixedAmount can be set', 400);
    }

    // Check if both are null/undefined
    const actualPercentage = percentage !== undefined ? percentage : null;
    const actualFixedAmount = fixedAmount !== undefined ? fixedAmount : null;

    // Find active tax configuration
    let tax = await Tax.findOne({ where: { isActive: true } });

    if (tax) {
      // Update existing
      tax.percentage = actualPercentage;
      tax.fixedAmount = actualFixedAmount;
      await tax.save();
    } else {
      // Create new
      tax = await Tax.create({
        percentage: actualPercentage,
        fixedAmount: actualFixedAmount,
        isActive: true,
      });
    }

    // Emit socket event for real-time updates
    if (global.socketService) {
      global.socketService.emitTaxUpdated({
        id: tax.id,
        percentage: tax.percentage || 0,
        fixedAmount: tax.fixedAmount || 0,
        isActive: tax.isActive,
        action: 'updated'
      });
    }

    res.status(200).json({
      success: true,
      message: 'Tax configuration saved successfully',
      data: {
        id: tax.id,
        percentage: tax.percentage || 0,
        fixedAmount: tax.fixedAmount || 0,
      },
    });
  } catch (error) {
    next(error);
  }
};

// Get Current Tax Configuration
exports.getTaxConfiguration = async (req, res, next) => {
  try {
    const tax = await Tax.findOne({ where: { isActive: true } });

    if (!tax) {
      return res.status(200).json({
        success: true,
        data: {
          id: null,
          percentage: 0,
          fixedAmount: 0,
        },
      });
    }

    res.status(200).json({
      success: true,
      data: {
        id: tax.id,
        percentage: tax.percentage || 0,
        fixedAmount: tax.fixedAmount || 0,
      },
    });
  } catch (error) {
    next(error);
  }
};

// Delete Tax Configuration
exports.deleteTax = async (req, res, next) => {
  try {
    const tax = await Tax.findOne({ where: { isActive: true } });

    if (!tax) {
      throw new ErrorHandler('No active tax configuration found', 404);
    }

    const taxData = {
      id: tax.id,
      percentage: tax.percentage || 0,
      fixedAmount: tax.fixedAmount || 0,
    };

    // Soft delete - set both to null
    tax.percentage = null;
    tax.fixedAmount = null;
    tax.isActive = false;
    await tax.save();

    // Emit socket event for real-time updates
    if (global.socketService) {
      global.socketService.emitTaxDeleted({
        ...taxData,
        isActive: false,
        action: 'deleted'
      });
    }

    res.status(200).json({
      success: true,
      message: 'Tax configuration deleted successfully',
    });
  } catch (error) {
    next(error);
  }
};

// Calculate Tax for Given Amount (Customer API)
exports.calculateTax = async (req, res, next) => {
  try {
    const { amount } = req.body;

    if (!amount || amount <= 0) {
      throw new ErrorHandler('Valid amount is required', 400);
    }

    const tax = await Tax.findOne({ where: { isActive: true } });
    const platformCharge = await PlatformCharge.findOne({ where: { isActive: true } });

    let taxAmount = 0;
    let taxType = 'none';
    let platformChargeAmount = 0;

    // Calculate tax
    if (tax) {
      if (tax.percentage !== null && tax.percentage > 0) {
        // Calculate percentage-based tax
        taxAmount = (parseFloat(amount) * parseFloat(tax.percentage)) / 100;
        taxType = 'percentage';
      } else if (tax.fixedAmount !== null && tax.fixedAmount > 0) {
        // Use fixed tax amount
        taxAmount = parseFloat(tax.fixedAmount);
        taxType = 'fixed';
      }
    }

    // Get platform charge
    if (platformCharge && platformCharge.amount > 0) {
      platformChargeAmount = parseFloat(platformCharge.amount);
    }

    // Calculate total: baseAmount + tax + platformCharge
    const totalAmount = parseFloat(amount) + taxAmount + platformChargeAmount;

    res.status(200).json({
      success: true,
      data: {
        baseAmount: parseFloat(amount),
        taxType: taxType,
        taxValue: tax ? (tax.percentage || tax.fixedAmount || 0) : 0,
        taxAmount: parseFloat(taxAmount.toFixed(2)),
        platformCharge: parseFloat(platformChargeAmount.toFixed(2)),
        totalAmount: parseFloat(totalAmount.toFixed(2)),
      },
    });
  } catch (error) {
    next(error);
  }
};
