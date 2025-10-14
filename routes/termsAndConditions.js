const express = require('express');
const router = express.Router();
const termsAndConditionsController = require('../controllers/termsAndConditionsController');
const { authenticate, authorize } = require('../middleware/auth');

// All admin routes require authentication and admin authorization
router.use(authenticate);
router.use(authorize('admin'));

// Create new Terms & Conditions (single or multiple)
router.post('/', termsAndConditionsController.createTermsAndConditionsHandler);

// Get all Terms & Conditions (with pagination, search, status filter)
router.get('/', termsAndConditionsController.getAllTermsAndConditions);

// Get Terms & Conditions by status (MUST come before /:id route)
router.get('/status/:status', termsAndConditionsController.getTermsAndConditionsByStatus);

// Get a single Terms & Conditions by ID (MUST come last among GET routes)
router.get('/:id', termsAndConditionsController.getTermsAndConditionsById);

// Update Terms & Conditions
router.put('/:id', termsAndConditionsController.updateTermsAndConditionsHandler);

// Update Terms & Conditions status only
router.patch('/:id/status', termsAndConditionsController.updateTermsAndConditionsStatus);

// Delete Terms & Conditions
router.delete('/:id', termsAndConditionsController.deleteTermsAndConditions);

module.exports = router;
