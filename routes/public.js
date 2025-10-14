const express = require('express');
const router = express.Router();
const termsAndConditionsController = require('../controllers/termsAndConditionsController');
const privacyPolicyController = require('../controllers/privacyPolicyController');

// Public routes - no authentication required

// Get active Terms & Conditions (for public use)
router.get('/terms-and-conditions', termsAndConditionsController.getActiveTermsAndConditions);

// Get active Privacy Policies (for public use)
router.get('/privacy-policies', privacyPolicyController.getActivePrivacyPolicies);

module.exports = router;
