const multer = require('multer');
const { CloudinaryStorage } = require('multer-storage-cloudinary');
const cloudinary = require('../config/cloudinary');

// Configure Cloudinary storage for delivery proof images
const storage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: {
    folder: 'lpg-delivery-proofs', // Folder name in cloudinary
    allowed_formats: ['jpg', 'jpeg', 'png', 'gif', 'webp'],
    transformation: [
      { width: 1200, height: 1200, crop: 'limit' }, // Resize images for delivery proofs
      { quality: 'auto' } // Auto optimize quality
    ]
  }
});

// File filter for delivery proof images
const fileFilter = (req, file, cb) => {
  // Allow only images
  if (file.mimetype.startsWith('image/')) {
    cb(null, true);
  } else {
    cb(new Error('Only image files are allowed for delivery proof!'), false);
  }
};

// Configure multer for delivery proof uploads
const uploadDeliveryProof = multer({
  storage: storage,
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB limit for delivery proof images
  },
  fileFilter: fileFilter
});

module.exports = uploadDeliveryProof;
