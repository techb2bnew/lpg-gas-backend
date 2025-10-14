const express = require('express');
const router = express.Router();
const taxController = require('../controllers/taxController');
const { authenticate, authorize } = require('../middleware/auth');
const { addOrUpdateTaxSchema, calculateTaxSchema } = require('../validations/taxValidation');

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

// ========== TAX MANAGEMENT (ADMIN ONLY) ==========

// Add or Update Tax Configuration (Admin only)
router.post(
  '/',
  authenticate,
  authorize('admin'),
  validate(addOrUpdateTaxSchema),
  taxController.addOrUpdateTax
);

// Get Current Tax Configuration (Admin only)
router.get(
  '/',
  authenticate,
  authorize('admin'),
  taxController.getTaxConfiguration
);

// Delete Tax Configuration (Admin only)
router.delete(
  '/',
  authenticate,
  authorize('admin'),
  taxController.deleteTax
);

// ========== TAX CALCULATION (CUSTOMER API) ==========

// Calculate Tax for Given Amount (Authenticated users)
router.post(
  '/calculate',
  authenticate,
  validate(calculateTaxSchema),
  taxController.calculateTax
);

module.exports = router;
