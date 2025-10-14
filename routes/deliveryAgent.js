const express = require('express');
const router = express.Router();
const deliveryAgentController = require('../controllers/deliveryAgentController');
const { authenticate } = require('../middleware/auth');
const upload = require('../middleware/upload');

// All routes require authentication
router.use(authenticate);

// Create a new delivery agent (optional image upload)
router.post('/', upload.single('profileImage'), deliveryAgentController.createAgent);

// Get all delivery agents (comprehensive endpoint)
// Supports: pagination, search, status filter, and getting by ID
router.get('/', deliveryAgentController.getAllAgents);

// Get detailed agent information with all delivered orders
router.get('/:agentId', deliveryAgentController.getAgentDetails);

// Update delivery agent (optional image upload)
router.put('/:id', upload.single('profileImage'), deliveryAgentController.updateAgent);

// Update agent status only
router.patch('/:id/status', deliveryAgentController.updateAgentStatus);

// Delete delivery agent
router.delete('/:id', deliveryAgentController.deleteAgent);

module.exports = router;
