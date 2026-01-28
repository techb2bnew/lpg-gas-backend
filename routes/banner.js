const express = require('express');
const router = express.Router();
const bannerController = require('../controllers/bannerController');
const { authenticate } = require('../middleware/auth');
const bannerUpload = require('../middleware/bannerUpload');

// Create banner (Admin only - max 5 images)
router.post('/', authenticate, bannerUpload.array('images', 5), bannerController.create);

// Get all banners
router.get('/', authenticate, bannerController.list);

// Get banner by ID
router.get('/:id', authenticate, bannerController.getById);


// Delete specific image from banner by image ID (Admin only)
router.delete('/:bannerId/image/:imageId', authenticate, bannerController.deleteImage);

module.exports = router;
