const { Banner } = require('../models');
const { createError } = require('../utils/errorHandler');
const logger = require('../utils/logger');
const cloudinary = require('../config/cloudinary');
const { v4: uuidv4 } = require('uuid');

// Create or update banner (only one banner exists)
const create = async (req, res, next) => {
  try {
    // Only admin can create/update banners
    if (!req.user || req.user.role !== 'admin') {
      return next(createError(403, 'Only admin can create banners'));
    }

    // Handle uploaded images - each image will have { id, url }
    let images = [];
    
    // If images are uploaded via multer (form-data)
    if (Array.isArray(req.files) && req.files.length > 0) {
      const uploadedImages = req.files.map(f => ({
        id: uuidv4(),
        url: f.path // Cloudinary URLs
      }));
      images = [...images, ...uploadedImages];
    }

    // If base64 images are provided in body
    if (req.body.images) {
      let bodyImages = req.body.images;
      
      // Parse if it's a JSON string
      if (typeof bodyImages === 'string') {
        try {
          bodyImages = JSON.parse(bodyImages);
        } catch (_) {
          bodyImages = [bodyImages];
        }
      }

      if (Array.isArray(bodyImages)) {
        const dataUrls = bodyImages.filter(img => typeof img === 'string' && /^data:image\//i.test(img));
        const urlStrings = bodyImages.filter(img => typeof img === 'string' && !/^data:image\//i.test(img));

        // Upload base64 images to Cloudinary
        if (dataUrls.length > 0) {
          const uploaded = await Promise.all(
            dataUrls.map(img => cloudinary.uploader.upload(img, { folder: 'lpg-banners' }))
          );
          const uploadedImages = uploaded.map(u => ({
            id: uuidv4(),
            url: u.secure_url
          }));
          images = [...images, ...uploadedImages];
        }

        // Add URL strings with generated IDs
        const urlImages = urlStrings.map(url => ({
          id: uuidv4(),
          url: url
        }));
        images = [...images, ...urlImages];
      }
    }

    // Validate max 5 images
    if (images.length > 5) {
      return next(createError(400, 'Maximum 5 images allowed per banner'));
    }

    // Validate at least 1 image
    if (images.length === 0) {
      return next(createError(400, 'At least 1 image is required'));
    }

    // Check if banner already exists
    let banner = await Banner.findOne();
    let isNew = false;

    if (banner) {
      // Update existing banner
      await banner.update({ images });
      logger.info(`Banner updated with ${images.length} images`);
    } else {
      // Create new banner
      banner = await Banner.create({ images });
      isNew = true;
      logger.info(`Banner created with ${images.length} images`);
    }

    res.status(isNew ? 201 : 200).json({
      success: true,
      message: isNew ? 'Banner created successfully' : 'Banner updated successfully',
      data: { banner }
    });
  } catch (error) {
    next(error);
  }
};

// Get all banners
const list = async (req, res, next) => {
  try {
    const { page = 1, limit = 10 } = req.query;
    const offset = (page - 1) * limit;

    const banners = await Banner.findAndCountAll({
      limit: parseInt(limit),
      offset: parseInt(offset),
      order: [['createdAt', 'DESC']]
    });

    const totalPages = Math.ceil(banners.count / limit);

    res.status(200).json({
      success: true,
      message: 'Banners retrieved successfully',
      data: {
        banners: banners.rows,
        pagination: {
          currentPage: parseInt(page),
          totalPages,
          totalItems: banners.count,
          itemsPerPage: parseInt(limit)
        }
      }
    });
  } catch (error) {
    next(error);
  }
};

// Get banner by ID
const getById = async (req, res, next) => {
  try {
    const { id } = req.params;

    const banner = await Banner.findByPk(id);

    if (!banner) {
      return next(createError(404, 'Banner not found'));
    }

    res.status(200).json({
      success: true,
      message: 'Banner retrieved successfully',
      data: { banner }
    });
  } catch (error) {
    next(error);
  }
};


// Delete specific image from banner by image ID
const deleteImage = async (req, res, next) => {
  try {
    // Only admin can delete images
    if (!req.user || req.user.role !== 'admin') {
      return next(createError(403, 'Only admin can delete images'));
    }

    const { bannerId, imageId } = req.params;

    const banner = await Banner.findByPk(bannerId);

    if (!banner) {
      return next(createError(404, 'Banner not found'));
    }

    // Find the image to delete
    const imageToDelete = (banner.images || []).find(img => img.id === imageId);

    if (!imageToDelete) {
      return next(createError(404, 'Image not found'));
    }

    // Delete from Cloudinary
    try {
      const urlParts = imageToDelete.url.split('/');
      const filename = urlParts[urlParts.length - 1];
      const publicId = `lpg-banners/${filename.split('.')[0]}`;
      await cloudinary.uploader.destroy(publicId);
      logger.info(`Deleted banner image from Cloudinary: ${publicId}`);
    } catch (deleteError) {
      logger.warn(`Failed to delete banner image from Cloudinary: ${imageToDelete.url}`, deleteError);
    }

    // Remove image from array
    const updatedImages = (banner.images || []).filter(img => img.id !== imageId);

    // Update banner
    await banner.update({ images: updatedImages });

    logger.info(`Image ${imageId} deleted from banner ${bannerId}`);

    res.status(200).json({
      success: true,
      message: 'Image deleted successfully',
      data: { banner }
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  create,
  list,
  getById,
  deleteImage
};

