const express = require('express');
const router = express.Router();
const couponController = require('../controllers/couponController');
const { authenticate, authorize } = require('../middleware/auth');
const { addCouponSchema, updateCouponSchema, toggleCouponStatusSchema, applyCouponSchema } = require('../validations/couponValidation');

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

// ========== COUPON MANAGEMENT (ADMIN & AGENCY OWNER) ==========

// Add Coupon
router.post(
  '/',
  authenticate,
  authorize('admin', 'agency_owner'),
  validate(addCouponSchema),
  couponController.addCoupon
);

// Get All Coupons
router.get(
  '/',
  authenticate,
  authorize('admin', 'agency_owner'),
  couponController.getAllCoupons
);

// Update Coupon
router.put(
  '/:id',
  authenticate,
  authorize('admin', 'agency_owner'),
  validate(updateCouponSchema),
  couponController.updateCoupon
);

// Toggle Coupon Status (Active/Inactive)
router.patch(
  '/:id/status',
  authenticate,
  authorize('admin', 'agency_owner'),
  validate(toggleCouponStatusSchema),
  couponController.toggleCouponStatus
);

// Delete Coupon
router.delete(
  '/:id',
  authenticate,
  authorize('admin', 'agency_owner'),
  couponController.deleteCoupon
);

// ========== CUSTOMER COUPON APIs ==========

// Get Active Coupons for Customer (by Agency)
router.get(
  '/customer',
  authenticate,
  couponController.getCustomerCoupons
);

// Apply Coupon (Customer)
router.post(
  '/apply',
  authenticate,
  validate(applyCouponSchema),
  couponController.applyCoupon
);

module.exports = router;
