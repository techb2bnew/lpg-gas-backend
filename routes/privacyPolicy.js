const express = require('express');
const router = express.Router();
const privacyPolicyController = require('../controllers/privacyPolicyController');
const { authenticate, authorize } = require('../middleware/auth');

// All admin routes require authentication and admin authorization
router.use(authenticate);
router.use(authorize('admin'));

// Create new Privacy Policy
router.post('/', privacyPolicyController.createPrivacyPolicyHandler);

// Get all Privacy Policies (with pagination, search, status filter)
router.get('/', privacyPolicyController.getAllPrivacyPolicies);

// Get Privacy Policies by status (MUST come before /:id route)
router.get('/status/:status', privacyPolicyController.getPrivacyPoliciesByStatus);

// Get a single Privacy Policy by ID (MUST come last among GET routes)
router.get('/:id', privacyPolicyController.getPrivacyPolicyById);

// Update Privacy Policy
router.put('/:id', privacyPolicyController.updatePrivacyPolicyHandler);

// Update Privacy Policy status only
router.patch('/:id/status', privacyPolicyController.updatePrivacyPolicyStatus);

// Delete Privacy Policy
router.delete('/:id', privacyPolicyController.deletePrivacyPolicy);

module.exports = router;
