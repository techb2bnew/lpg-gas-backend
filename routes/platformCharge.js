const express = require('express');
const router = express.Router();
const platformChargeController = require('../controllers/platformChargeController');
const { authenticate, authorize } = require('../middleware/auth');
const { addOrUpdatePlatformChargeSchema } = require('../validations/platformChargeValidation');

// Validation middleware
const validate = (schema) => {
  return (req, res, next) => {
    const { error } = schema.validate(req.body);
    if (error) {
      return res.status(400).json({
        success: false,
        message: error.details[0].message,
      });
    }
    next();
  };
};

// ========== PLATFORM CHARGE MANAGEMENT (ADMIN ONLY) ==========

// Add or Update Platform Charge (Admin only)
router.post(
  '/',
  authenticate,
  authorize('admin'),
  validate(addOrUpdatePlatformChargeSchema),
  platformChargeController.addOrUpdatePlatformCharge
);

// Get Platform Charge (Admin only)
router.get(
  '/',
  authenticate,
  authorize('admin'),
  platformChargeController.getPlatformCharge
);

// Delete Platform Charge (Admin only)
router.delete(
  '/',
  authenticate,
  authorize('admin'),
  platformChargeController.deletePlatformCharge
);

module.exports = router;
