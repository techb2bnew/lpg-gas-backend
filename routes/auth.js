const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const { authenticate } = require('../middleware/auth');
const upload = require('../middleware/upload');
const orderController = require('../controllers/orderController');

router.post('/payment2', orderController.orderpesapalPayment);

// Public routes
router.post('/login', authController.login); // Admin login with email/password
router.post('/setup', authController.setupUser); // First time setup (Admin)
router.post('/request-otp', authController.requestOTP); // Request OTP for customer/agent
router.post('/verify-otp', authController.verifyOTP); // Verify OTP for customer/agent
router.post('/forgot-password', authController.forgotPasswordRequest); // Admin: send OTP to email
router.post('/reset-password', authController.resetPassword); // Admin: reset using OTP
// Agency owner: initial password set (no auth)
router.post('/agency-owner/set-password', authController.setAgencyOwnerInitialPassword);

// Protected routes
router.post('/complete-profile/customer', authenticate, authController.completeCustomerProfile); // Complete customer profile
router.post('/complete-profile/agent', authenticate, authController.completeAgentProfile); // Complete agent profile

// Protected routes
router.get('/profile', authenticate, authController.getProfile);
router.put('/profile', authenticate, upload.single('image'), authController.updateProfile);
router.put('/agent/profile', authenticate, upload.single('image'), authController.updateAgentProfile); // Agent specific profile update
router.put('/agent/profile/comprehensive', authenticate, upload.single('image'), authController.updateAgentProfileComplete); // Agent comprehensive profile update
router.patch('/agent/status', authenticate, authController.updateAgentStatus); // Agent status update (online/offline)
router.post('/logout', authenticate, authController.logout);
router.delete('/account', authenticate, authController.deleteAccount); // Delete user account

// Admin only routes
router.get('/customers', authenticate, authController.getAllCustomers); // Get all customers (Admin only)
router.get('/customers/:customerId', authenticate, authController.getCustomerDetails); // Get detailed customer information (Admin and Agency Owner)
router.patch('/users/:userId/block', authenticate, authController.setUserBlockStatus); // Block/unblock user (Admin only)

module.exports = router;
