const express = require('express');
const router = express.Router();
const controller = require('../controllers/agencyController');
const { authenticate } = require('../middleware/auth');
const upload = require('../middleware/upload');

// Public confirmation link (email) - MUST be before /:id route
router.get('/confirm', controller.confirm);

// Public endpoint to get only active agencies
router.get('/active', controller.listActive);

// Admin-protected CRUD
router.post('/', authenticate, upload.single('image'), controller.create);
router.get('/', authenticate, controller.list);
router.get('/:id', authenticate, controller.getById);
router.put('/:id', authenticate, upload.single('image'), controller.update);
router.put('/:id/status', authenticate, controller.updateStatus);
router.delete('/:id', authenticate, controller.remove);

module.exports = router;


