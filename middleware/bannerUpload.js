const multer = require('multer');
const { CloudinaryStorage } = require('multer-storage-cloudinary');
const cloudinary = require('../config/cloudinary');

// Configure Cloudinary storage for banner images
const storage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: {
    folder: 'lpg-banners', // Folder name in cloudinary
    allowed_formats: ['jpg', 'jpeg', 'png', 'gif', 'webp'],
    transformation: [
      { width: 1920, height: 800, crop: 'limit' }, // Banner dimensions
      { quality: 'auto' } // Auto optimize quality
    ]
  }
});

// File filter for banner images
const fileFilter = (req, file, cb) => {
  // Allow only images
  if (file.mimetype.startsWith('image/')) {
    cb(null, true);
  } else {
    cb(new Error('Only image files are allowed for banners!'), false);
  }
};

// Configure multer for banner uploads (max 5 images)
const bannerUpload = multer({
  storage: storage,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit per image
    files: 5 // Maximum 5 files
  },
  fileFilter: fileFilter
});

module.exports = bannerUpload;

