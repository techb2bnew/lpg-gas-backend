const express = require('express');
const router = express.Router();
const productController = require('../controllers/productController');
const { authenticate } = require('../middleware/auth');
const upload = require('../middleware/upload');

// All routes require authentication
router.use(authenticate);

// ========== PRODUCT MANAGEMENT (Admin Only) ==========

// Create a new product (Admin only - supports multiple images via form-data field "images")
router.post('/', upload.array('images', 10), productController.createProductHandler);

// Get all products (comprehensive endpoint)
// Supports: pagination, search, status filter, agencyId filter, includeInventory
router.get('/', productController.getAllProducts);



// Get products by status (MUST come before /:id route)
router.get('/status/:status', productController.getProductsByStatus);

// Get a single product by ID (MUST come last among GET routes)
router.get('/:id', productController.getProductById);

// Update product (Admin only - supports multiple images via form-data field "images")
router.put('/:id', upload.array('images', 10), productController.updateProductHandler);

// Update product status only (Admin only)
router.patch('/:id/status', productController.updateProductStatus);

// Delete product (Admin only)
router.delete('/:id', productController.deleteProduct);

// ========== AGENCY INVENTORY MANAGEMENT ==========

// Get all agency inventory (Admin only)
router.get('/inventory/all', productController.getAllAgencyInventory);

// Get agency inventory
router.get('/inventory/agency/:agencyId', productController.getAgencyInventory);

// Admin: Update ANY agency's stock (Admin-only - MUST come before generic route)
// Supports both PUT and PATCH methods
router.put('/:productId/inventory/agency/:agencyId/admin-update', productController.adminUpdateAgencyStock);
router.patch('/:productId/inventory/agency/:agencyId/admin-update', productController.adminUpdateAgencyStock);

// Add product to agency inventory
router.post('/:productId/inventory/agency/:agencyId', productController.addProductToAgency);

// Update agency inventory (Admin or Agency Owner)
router.put('/:productId/inventory/agency/:agencyId', productController.updateAgencyInventory);

// Remove product from agency inventory
router.delete('/:productId/inventory/agency/:agencyId', productController.removeProductFromAgency);

module.exports = router;
