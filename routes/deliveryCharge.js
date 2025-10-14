const express = require('express');
const router = express.Router();
const deliveryChargeController = require('../controllers/deliveryChargeController');
const { authenticate } = require('../middleware/auth');

// All routes require authentication
router.use(authenticate);

// Create delivery charge for an agency
router.post('/', deliveryChargeController.create);

// Get all delivery charges (Admin only)
router.get('/', deliveryChargeController.getAll);

// Calculate delivery charge for customer
router.post('/calculate', deliveryChargeController.calculateDeliveryCharge);

// Get delivery charge by agency ID
router.get('/agency/:agencyId', deliveryChargeController.getByAgencyId);

// Get delivery charge by ID
router.get('/:id', deliveryChargeController.getById);

// Update delivery charge
router.put('/:id', deliveryChargeController.update);

// Delete delivery charge
router.delete('/:id', deliveryChargeController.deleteCharge);

module.exports = router;

