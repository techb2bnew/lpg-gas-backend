const express = require('express');
const router = express.Router();
const categoryController = require('../controllers/categoryController');
const { authenticate } = require('../middleware/auth');

// All routes require authentication
router.use(authenticate);

// ========== CATEGORY MANAGEMENT ==========

// Create a new category (Admin only)
router.post('/', categoryController.createCategory);

// Get all categories
router.get('/', categoryController.getAllCategories);

// Get category by ID
router.get('/:id', categoryController.getCategoryById);

// Update category (Admin only)
router.put('/:id', categoryController.updateCategory);

// Update category status (Admin only)
router.patch('/:id/status', categoryController.updateCategoryStatus);

// Delete category (Admin only)
router.delete('/:id', categoryController.deleteCategory);

module.exports = router;
