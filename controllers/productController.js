const { Product, AgencyInventory, Agency } = require('../models');
const { createProduct, updateProduct, updateStatus, agencyInventorySchema } = require('../validations/productValidation');
const { createError } = require('../utils/errorHandler');
const logger = require('../utils/logger');
const { Op, Sequelize } = require('sequelize');

// Create a new product (Admin only)
const createProductHandler = async (req, res, next) => {
  try {
    // Only admin can create products
    if (!req.user || req.user.role !== 'admin') {
      return next(createError(403, 'Only admin can create products'));
    }

    // If variants, images are passed as JSON strings (form-data), parse them
    const body = { ...req.body };
    if (typeof body.variants === 'string') {
      try { body.variants = JSON.parse(body.variants); } catch (_) {}
    }
    if (typeof body.images === 'string') {
      try { body.images = JSON.parse(body.images); } catch (_) {}
    }
    // Accept tags as JSON string from form-data
    if (typeof body.tags === 'string') {
      try { body.tags = JSON.parse(body.tags); } catch (_) {}
    }

    // Admin creates products without agencyId (global products)
    // Agency-specific inventory will be managed separately

    // If base64 images provided, upload them to Cloudinary
    if (Array.isArray(body.images)) {
      const cloudinary = require('../config/cloudinary');
      const dataUrls = body.images.filter((img) => typeof img === 'string' && /^data:image\//i.test(img));
      const urlStrings = body.images.filter((img) => typeof img === 'string' && !/^data:image\//i.test(img));
      if (dataUrls.length > 0) {
        const uploaded = await Promise.all(
          dataUrls.map((img) => cloudinary.uploader.upload(img, { folder: 'lpg-products' }))
        );
        body.images = [...urlStrings, ...uploaded.map((u) => u.secure_url)];
      }
    }

    // Handle uploaded images (cloudinary)
    if (Array.isArray(req.files) && req.files.length > 0) {
      const uploadedUrls = req.files.map(f => f.path); // Cloudinary URL
      if (Array.isArray(body.images)) {
        body.images = [...body.images, ...uploadedUrls];
      } else {
        body.images = uploadedUrls;
      }
    }

    // Validate request body
    const { error, value } = createProduct.validate(body);
    if (error) {
      return next(createError(400, error.details[0].message));
    }

    // Check if product name already exists globally
    const existingProduct = await Product.findOne({ 
      where: { 
        productName: value.productName
      } 
    });
    if (existingProduct) {
      return next(createError(400, 'Product name already exists'));
    }

    // Create product
    const product = await Product.create(value);

    logger.info(`Product created: ${product.productName} by admin`);

    // Emit socket notification
    const socketService = global.socketService;
    if (socketService) {
      socketService.emitProductCreated({
        id: product.id,
        productName: product.productName,
        category: product.category,
        status: product.status,
        createdBy: req.user.email || 'admin'
      });
    }

    res.status(201).json({
      success: true,
      message: 'Product created successfully',
      data: { product }
    });
  } catch (error) {
    next(error);
  }
};

// Get all products (comprehensive endpoint)
const getAllProducts = async (req, res, next) => {
  try {
    const { page = 1, limit = 10, status, search, id, agencyId, agencyEmail, agencyName, agencyCity, agencyPhone, includeInventory } = req.query;
    const offset = (page - 1) * limit;

    // If ID is provided, get specific product
    if (id) {
      const whereClause = { id };
      
      // Note: Products are no longer directly associated with agencies
      // Agency filtering is now handled through AgencyInventory
      
      // Build include options based on whether inventory data is requested
      const includeOptions = [];
      
      if (includeInventory === 'true') {
        includeOptions.push({
          model: AgencyInventory,
          as: 'AgencyInventory',
          include: [
            {
              model: Agency,
              as: 'Agency',
              attributes: ['id', 'name', 'email', 'phone', 'city', 'status']
            }
          ],
          required: false
        });
      }

      const product = await Product.findOne({ 
        where: whereClause,
        include: includeOptions
      });
      if (!product) {
        return next(createError(404, 'Product not found'));
      }

      // Transform product to show agency-specific variants when agencyId is provided
      const productData = product.toJSON();
      
      // If agencyId is provided and product has agency inventory, show agency-specific variants
      if (agencyId && productData.AgencyInventory && productData.AgencyInventory.length > 0) {
        const agencyInventory = productData.AgencyInventory.find(inv => inv.agencyId === agencyId);
        if (agencyInventory && agencyInventory.agencyVariants && agencyInventory.agencyVariants.length > 0) {
          // Replace global variants with agency-specific variants
          productData.variants = agencyInventory.agencyVariants;
          productData.agencyPrice = agencyInventory.agencyPrice;
          productData.agencyStock = agencyInventory.stock;
          productData.agencyLowStockThreshold = agencyInventory.lowStockThreshold;
          productData.agencyIsActive = agencyInventory.isActive;
        }
      }

      return res.status(200).json({
        success: true,
        message: 'Product retrieved successfully',
        data: { product: productData }
      });
    }

    // Build where clause
    const whereClause = {};
    
    // Note: Products are no longer directly associated with agencies
    // Agency filtering is now handled through AgencyInventory
    
    if (status) {
      whereClause.status = status;
    } else {
      // Role-based default filtering
      if (req.user && req.user.role === 'customer') {
        // Customers only see active products by default
        whereClause.status = 'active';
      }
      // Admin and agency owners see all products (no status filter)
    }
    if (search) {
      whereClause[Op.or] = [
        { productName: { [Op.iLike]: `%${search}%` } },
        { description: { [Op.iLike]: `%${search}%` } },
        { unit: { [Op.iLike]: `%${search}%` } }
      ];
    }

    // Agency filtering is now handled through AgencyInventory relationships
    // No need for embedded agencies JSON filtering

    // Build include options based on whether inventory data is requested or agencyId is provided
    const includeOptions = [];
    
    if (includeInventory === 'true' || agencyId) {
      includeOptions.push({
        model: AgencyInventory,
        as: 'AgencyInventory',
        include: [
          {
            model: Agency,
            as: 'Agency',
            attributes: ['id', 'name', 'email', 'phone', 'city', 'status']
          }
        ],
        required: false
      });
    }

    const products = await Product.findAndCountAll({
      where: whereClause,
      include: includeOptions,
      limit: parseInt(limit),
      offset: parseInt(offset),
      order: [['createdAt', 'DESC']]
    });

    const totalPages = Math.ceil(products.count / limit);

    // Transform products to show agency-specific variants when agencyId is provided
    let transformedProducts = products.rows.map(product => {
      const productData = product.toJSON();
      
      // If agencyId is provided and product has agency inventory, show agency-specific variants
      if (agencyId && productData.AgencyInventory && productData.AgencyInventory.length > 0) {
        const agencyInventory = productData.AgencyInventory.find(inv => inv.agencyId === agencyId);
        if (agencyInventory && agencyInventory.agencyVariants && agencyInventory.agencyVariants.length > 0) {
          // Filter agency variants for customers (remove 0 stock variants)
          let filteredAgencyVariants = agencyInventory.agencyVariants;
          if (req.user && req.user.role === 'customer') {
            filteredAgencyVariants = agencyInventory.agencyVariants.filter(variant => 
              variant.stock && variant.stock > 0
            );
          }
          
          // Replace global variants with agency-specific variants
          productData.variants = filteredAgencyVariants;
          productData.agencyPrice = agencyInventory.agencyPrice;
          productData.agencyStock = agencyInventory.stock;
          productData.agencyLowStockThreshold = agencyInventory.lowStockThreshold;
          productData.agencyIsActive = agencyInventory.isActive;
          
          // Also update the agencyInventory object to show filtered variants
          if (req.user && req.user.role === 'customer') {
            agencyInventory.agencyVariants = filteredAgencyVariants;
          }
        }
        
        // Filter AgencyInventory to only show the requested agency's data
        productData.AgencyInventory = productData.AgencyInventory.filter(inv => inv.agencyId === agencyId);
      }
      
      return productData;
    });

    // Filter products based on status for customers
    // If agencyId is provided (customer view), apply status filtering
    if (agencyId && req.user && req.user.role === 'customer') {
      transformedProducts = transformedProducts.filter(product => {
        // First check if product has agency inventory
        if (product.AgencyInventory && product.AgencyInventory.length > 0) {
          const agencyInventory = product.AgencyInventory.find(inv => inv.agencyId === agencyId);
          if (agencyInventory) {
            // Agency status is priority - if agency says active, show it
            if (agencyInventory.isActive === true) {
              // Filter out variants with 0 stock for customers
              if (product.variants && Array.isArray(product.variants)) {
                product.variants = product.variants.filter(variant => 
                  variant.stock && variant.stock > 0
                );
              }
              return true; // Show product regardless of admin status
            } else {
              return false; // Hide product if agency says inactive
            }
          }
        }
        
        // If no agency inventory found, don't show the product
        return false;
      });
    }

    // Update pagination for filtered results
    const filteredCount = transformedProducts.length;
    const filteredTotalPages = Math.ceil(filteredCount / limit);

    res.status(200).json({
      success: true,
      message: 'Products retrieved successfully',
      data: {
        products: transformedProducts,
        pagination: {
          currentPage: parseInt(page),
          totalPages: filteredTotalPages,
          totalItems: filteredCount,
          itemsPerPage: parseInt(limit)
        }
      }
    });
  } catch (error) {
    next(error);
  }
};

// Update product
const updateProductHandler = async (req, res, next) => {
  try {
    const { id } = req.params;

    // Parse possibly stringified arrays when form-data
    const body = { ...req.body };
    if (typeof body.variants === 'string') {
      try { body.variants = JSON.parse(body.variants); } catch (_) {}
    }
    if (typeof body.images === 'string') {
      try { body.images = JSON.parse(body.images); } catch (_) {}
    }
    if (typeof body.agencies === 'string') {
      try { body.agencies = JSON.parse(body.agencies); } catch (_) {}
    }
    if (typeof body.imagesToDelete === 'string') {
      try { body.imagesToDelete = JSON.parse(body.imagesToDelete); } catch (_) {}
    }
    if (typeof body.existingImages === 'string') {
      try { body.existingImages = JSON.parse(body.existingImages); } catch (_) {}
    }
    // Accept tags as JSON string from form-data during update
    if (typeof body.tags === 'string') {
      try { body.tags = JSON.parse(body.tags); } catch (_) {}
    }

    // If base64 images provided during update, upload them to Cloudinary
    if (Array.isArray(body.images)) {
      const cloudinary = require('../config/cloudinary');
      const dataUrls = body.images.filter((img) => typeof img === 'string' && /^data:image\//i.test(img));
      const urlStrings = body.images.filter((img) => typeof img === 'string' && !/^data:image\//i.test(img));
      if (dataUrls.length > 0) {
        const uploaded = await Promise.all(
          dataUrls.map((img) => cloudinary.uploader.upload(img, { folder: 'lpg-products' }))
        );
        body.images = [...urlStrings, ...uploaded.map((u) => u.secure_url)];
      }
    }

    // Image handling moved to comprehensive logic below

    // Handle image deletion - get current product first to access existing images
    // Note: Products are no longer associated with agencies directly
    const product = await Product.findOne({ where: { id } });
    if (!product) {
      return next(createError(404, 'Product not found'));
    }

    // Process image operations (deletion and existing images)
    let finalImages = [];
    
    // Start with existing images if provided, otherwise use current product images
    if (Array.isArray(body.existingImages) && body.existingImages.length > 0) {
      finalImages = [...body.existingImages];
    } else {
      finalImages = [...(product.images || [])];
    }
    
    // Remove images that are marked for deletion
    if (Array.isArray(body.imagesToDelete) && body.imagesToDelete.length > 0) {
      const cloudinary = require('../config/cloudinary');
      
      // Delete images from Cloudinary
      try {
        await Promise.all(
          body.imagesToDelete.map(async (imageUrl) => {
            try {
              // Extract public_id from Cloudinary URL
              const publicId = imageUrl.split('/').pop().split('.')[0];
              await cloudinary.uploader.destroy(publicId);
              logger.info(`Deleted image from Cloudinary: ${publicId}`);
            } catch (deleteError) {
              logger.warn(`Failed to delete image from Cloudinary: ${imageUrl}`, deleteError);
              // Continue even if one image deletion fails
            }
          })
        );
      } catch (error) {
        logger.error('Error deleting images from Cloudinary:', error);
        // Continue with the update even if Cloudinary deletion fails
      }
      
      // Remove deleted images from the final array
      finalImages = finalImages.filter(img => !body.imagesToDelete.includes(img));
    }
    
    // Add any new uploaded images (from req.files)
    if (Array.isArray(req.files) && req.files.length > 0) {
      const uploadedUrls = req.files.map(f => f.path); // Cloudinary URL
      finalImages = [...finalImages, ...uploadedUrls];
    }
    
    // Add any base64 images that were processed earlier
    if (Array.isArray(body.images)) {
      // Filter out base64 images (already processed) and keep URL strings
      const urlImages = body.images.filter(img => typeof img === 'string' && !/^data:image\//i.test(img));
      finalImages = [...finalImages, ...urlImages];
    }
    
    // Update the images array in the body
    body.images = finalImages;

    // Validate request body
    const { error, value } = updateProduct.validate(body);
    if (error) {
      return next(createError(400, error.details[0].message));
    }

    // Product already found above for image deletion logic

    // Check if product name is being updated and if it already exists globally
    if (value.productName && value.productName !== product.productName) {
      const existingProduct = await Product.findOne({ 
        where: { 
          productName: value.productName
        } 
      });
      if (existingProduct) {
        return next(createError(400, 'Product name already exists'));
      }
    }

    // Update product
    await product.update(value);

    logger.info(`Product updated: ${product.productName}`);

    // Emit socket notification
    const socketService = global.socketService;
    if (socketService) {
      socketService.emitProductUpdated({
        id: product.id,
        productName: product.productName,
        category: product.category,
        status: product.status,
        updatedBy: req.user.email || 'admin'
      });
    }

    res.status(200).json({
      success: true,
      message: 'Product updated successfully',
      data: { product }
    });
  } catch (error) {
    next(error);
  }
};

// Delete product
const deleteProduct = async (req, res, next) => {
  try {
    const { id } = req.params;

    // Note: Products are no longer associated with agencies directly
    const product = await Product.findOne({ where: { id } });
    if (!product) {
      return next(createError(404, 'Product not found'));
    }

    await product.destroy();

    logger.info(`Product deleted: ${product.productName}`);

    res.status(200).json({
      success: true,
      message: 'Product deleted successfully'
    });
  } catch (error) {
    next(error);
  }
};

// Update product status
const updateProductStatus = async (req, res, next) => {
  try {
    const { id } = req.params;

    // Validate request body
    const { error, value } = updateStatus.validate(req.body);
    if (error) {
      return next(createError(400, error.details[0].message));
    }

    // Note: Products are no longer associated with agencies directly
    const product = await Product.findOne({ where: { id } });
    if (!product) {
      return next(createError(404, 'Product not found'));
    }

    // Update status
    await product.update({ status: value.status });

    logger.info(`Product status updated: ${product.productName} - ${value.status}`);

    // Emit socket notification for global product status change
    const socketService = global.socketService;
    if (socketService) {
      // Get all agencies that have this product in their inventory
      const agenciesWithProduct = await AgencyInventory.findAll({
        where: { productId: id },
        include: [{ model: Agency, as: 'Agency', attributes: ['id', 'name'] }]
      });

      logger.info(`📤 Emitting global product status change for ${agenciesWithProduct.length} agencies`);
      logger.info(`📤 Agencies with product:`, agenciesWithProduct.map(ai => ({ 
        agencyId: ai.Agency.id, 
        agencyName: ai.Agency.name,
        currentIsActive: ai.isActive 
      })));

      // Emit to each agency that has this product
      agenciesWithProduct.forEach(agencyInventory => {
        const inventoryData = {
          productId: product.id,
          productName: product.productName,
          agencyId: agencyInventory.Agency.id,
          agencyName: agencyInventory.Agency.name,
          stock: agencyInventory.stock,
          lowStockThreshold: agencyInventory.lowStockThreshold,
          isActive: value.status === 'active' ? agencyInventory.isActive : false, // If product is inactive globally, set isActive to false
          action: 'global_status_updated'
        };
        
        logger.info(`📤 Emitting to agency ${agencyInventory.Agency.name}:`, inventoryData);
        socketService.emitInventoryUpdated(inventoryData);
      });

      // Also emit a global product status change event
      socketService.emitGlobalProductStatusChange({
        productId: product.id,
        productName: product.productName,
        status: value.status,
        affectedAgencies: agenciesWithProduct.length
      });
    }

    res.status(200).json({
      success: true,
      message: 'Product status updated successfully',
      data: { product }
    });
  } catch (error) {
    next(error);
  }
};

// Get individual product by ID
const getProductById = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { includeInventory, agencyId } = req.query;
    
    // Build where clause for finding product
    const whereClause = { id };
    
    // Note: Products are no longer directly associated with agencies
    // Agency filtering is now handled through AgencyInventory
    
    // Build include options - always include agency inventory to show actual stock
    const includeOptions = [{
      model: AgencyInventory,
      as: 'AgencyInventory',
      include: [
        {
          model: Agency,
          as: 'Agency',
          attributes: ['id', 'name', 'email', 'phone', 'city', 'status']
        }
      ],
      required: false
    }];
    
    const product = await Product.findOne({ 
      where: whereClause,
      include: includeOptions
    });
    
    if (!product) {
      return next(createError(404, 'Product not found'));
    }

    // Transform product to show agency-specific variants when agencyId is provided
    const productData = product.toJSON();
    
    // If agencyId is provided and product has agency inventory, show agency-specific variants
    if (agencyId && productData.AgencyInventory && productData.AgencyInventory.length > 0) {
      const agencyInventory = productData.AgencyInventory.find(inv => inv.agencyId === agencyId);
      if (agencyInventory && agencyInventory.agencyVariants && agencyInventory.agencyVariants.length > 0) {
        // Filter agency variants for customers (remove 0 stock variants)
        let filteredAgencyVariants = agencyInventory.agencyVariants;
        if (req.user && req.user.role === 'customer') {
          filteredAgencyVariants = agencyInventory.agencyVariants.filter(variant => 
            variant.stock && variant.stock > 0
          );
        }
        
        // Replace global variants with agency-specific variants
        productData.variants = filteredAgencyVariants;
        productData.agencyPrice = agencyInventory.agencyPrice;
        productData.agencyStock = agencyInventory.stock;
        productData.agencyLowStockThreshold = agencyInventory.lowStockThreshold;
        productData.agencyIsActive = agencyInventory.isActive;
        
        // Also update the agencyInventory object to show filtered variants
        if (req.user && req.user.role === 'customer') {
          agencyInventory.agencyVariants = filteredAgencyVariants;
        }
      }
      
      // Filter AgencyInventory to only show the requested agency's data
      productData.AgencyInventory = productData.AgencyInventory.filter(inv => inv.agencyId === agencyId);
    } else {
      // If no agencyId provided, show all agency inventory data with actual stock
      if (productData.AgencyInventory && productData.AgencyInventory.length > 0) {
        // Find the first active agency inventory to show actual stock
        const activeAgencyInventory = productData.AgencyInventory.find(inv => inv.isActive === true);
        if (activeAgencyInventory && activeAgencyInventory.agencyVariants && activeAgencyInventory.agencyVariants.length > 0) {
          // Replace global variants with actual agency variants showing real stock
          productData.variants = activeAgencyInventory.agencyVariants;
          productData.agencyPrice = activeAgencyInventory.agencyPrice;
          productData.agencyStock = activeAgencyInventory.stock;
          productData.agencyLowStockThreshold = activeAgencyInventory.lowStockThreshold;
          productData.agencyIsActive = activeAgencyInventory.isActive;
        }
      }
    }

    // Check status filtering for customers
    if (agencyId && req.user && req.user.role === 'customer') {
      // First check if product has agency inventory
      if (productData.AgencyInventory && productData.AgencyInventory.length > 0) {
        const agencyInventory = productData.AgencyInventory.find(inv => inv.agencyId === agencyId);
        if (agencyInventory) {
          // Agency status is priority - if agency says inactive, hide it
          if (agencyInventory.isActive !== true) {
            return next(createError(404, 'Product not found or not available'));
          }
          // Filter out variants with 0 stock for customers
          if (productData.variants && Array.isArray(productData.variants)) {
            productData.variants = productData.variants.filter(variant => 
              variant.stock && variant.stock > 0
            );
          }
        } else {
          // If no agency inventory found for this agency, don't show the product
          return next(createError(404, 'Product not found or not available'));
        }
      } else {
        // If no agency inventory found, don't show the product
        return next(createError(404, 'Product not found or not available'));
      }
    }

    res.status(200).json({
      success: true,
      message: 'Product retrieved successfully',
      data: { product: productData }
    });
  } catch (error) {
    next(error);
  }
};

// Get products by status
const getProductsByStatus = async (req, res, next) => {
  try {
    const { status } = req.params;
    const { includeInventory, agencyId } = req.query;

    if (!['active', 'inactive'].includes(status)) {
      return next(createError(400, 'Invalid status. Must be active or inactive'));
    }

    // Build where clause
    const whereClause = { status };
    
    // Note: Products are no longer directly associated with agencies
    // Agency filtering is now handled through AgencyInventory

    // Build include options based on whether inventory data is requested or agencyId is provided
    const includeOptions = [];
    
    if (includeInventory === 'true' || agencyId) {
      includeOptions.push({
        model: AgencyInventory,
        as: 'AgencyInventory',
        include: [
          {
            model: Agency,
            as: 'Agency',
            attributes: ['id', 'name', 'email', 'phone', 'city', 'status']
          }
        ],
        required: false
      });
    }

    const products = await Product.findAll({
      where: whereClause,
      include: includeOptions,
      order: [['createdAt', 'DESC']]
    });

    // Transform products to show agency-specific variants when agencyId is provided
    let transformedProducts = products.map(product => {
      const productData = product.toJSON();
      
      // If agencyId is provided and product has agency inventory, show agency-specific variants
      if (agencyId && productData.AgencyInventory && productData.AgencyInventory.length > 0) {
        const agencyInventory = productData.AgencyInventory.find(inv => inv.agencyId === agencyId);
        if (agencyInventory && agencyInventory.agencyVariants && agencyInventory.agencyVariants.length > 0) {
          // Filter agency variants for customers (remove 0 stock variants)
          let filteredAgencyVariants = agencyInventory.agencyVariants;
          if (req.user && req.user.role === 'customer') {
            filteredAgencyVariants = agencyInventory.agencyVariants.filter(variant => 
              variant.stock && variant.stock > 0
            );
          }
          
          // Replace global variants with agency-specific variants
          productData.variants = filteredAgencyVariants;
          productData.agencyPrice = agencyInventory.agencyPrice;
          productData.agencyStock = agencyInventory.stock;
          productData.agencyLowStockThreshold = agencyInventory.lowStockThreshold;
          productData.agencyIsActive = agencyInventory.isActive;
          
          // Also update the agencyInventory object to show filtered variants
          if (req.user && req.user.role === 'customer') {
            agencyInventory.agencyVariants = filteredAgencyVariants;
          }
        }
        
        // Filter AgencyInventory to only show the requested agency's data
        productData.AgencyInventory = productData.AgencyInventory.filter(inv => inv.agencyId === agencyId);
      }
      
      return productData;
    });

    // Filter products based on status for customers
    // If agencyId is provided (customer view), apply status filtering
    if (agencyId && req.user && req.user.role === 'customer') {
      transformedProducts = transformedProducts.filter(product => {
        // First check if product has agency inventory
        if (product.AgencyInventory && product.AgencyInventory.length > 0) {
          const agencyInventory = product.AgencyInventory.find(inv => inv.agencyId === agencyId);
          if (agencyInventory) {
            // Agency status is priority - if agency says active, show it
            if (agencyInventory.isActive === true) {
              // Filter out variants with 0 stock for customers
              if (product.variants && Array.isArray(product.variants)) {
                product.variants = product.variants.filter(variant => 
                  variant.stock && variant.stock > 0
                );
              }
              return true; // Show product regardless of admin status
            } else {
              return false; // Hide product if agency says inactive
            }
          }
        }
        
        // If no agency inventory found, don't show the product
        return false;
      });
    }

    res.status(200).json({
      success: true,
      message: `${status} products retrieved successfully`,
      data: { products: transformedProducts }
    });
  } catch (error) {
    next(error);
  }
};



// ========== AGENCY INVENTORY MANAGEMENT ==========

// Add product to agency inventory
const addProductToAgency = async (req, res, next) => {
  try {
    const { productId, agencyId } = req.params;

    // Check if user has permission (admin or agency owner)
    if (!req.user || (req.user.role !== 'admin' && req.user.role !== 'agency_owner')) {
      return next(createError(403, 'Only admin or agency owner can manage inventory'));
    }

    // If agency owner, ensure they can only manage their own agency
    if (req.user.role === 'agency_owner' && req.user.agencyId !== agencyId) {
      return next(createError(403, 'You can only manage your own agency inventory'));
    }

    // Validate request body
    const { error, value } = agencyInventorySchema.validate(req.body);
    if (error) {
      return next(createError(400, error.details[0].message));
    }

    // Check if product exists
    const product = await Product.findOne({ where: { id: productId } });
    if (!product) {
      return next(createError(404, 'Product not found'));
    }

    // Check if agency exists
    const agency = await Agency.findOne({ where: { id: agencyId } });
    if (!agency) {
      return next(createError(404, 'Agency not found'));
    }

    // Check if inventory already exists
    const existingInventory = await AgencyInventory.findOne({
      where: { productId: productId, agencyId: agencyId }
    });

    if (existingInventory) {
      return next(createError(400, 'Product already exists in agency inventory'));
    }

    // Create agency inventory
    const inventory = await AgencyInventory.create({
      productId: productId,
      agencyId: agencyId,
      ...value
    });

    logger.info(`Product added to agency inventory: ${product.productName} -> ${agency.name}`);

    // Emit socket notification
    const socketService = global.socketService;
    if (socketService) {
      socketService.emitInventoryUpdated({
        productId: product.id,
        productName: product.productName,
        agencyId: agency.id,
        agencyName: agency.name,
        stock: inventory.stock,
        lowStockThreshold: inventory.lowStockThreshold,
        isActive: inventory.isActive,
        action: 'added'
      });
    }

    res.status(201).json({
      success: true,
      message: 'Product added to agency inventory successfully',
      data: { inventory }
    });
  } catch (error) {
    next(error);
  }
};

// Update agency inventory
const updateAgencyInventory = async (req, res, next) => {
  try {
    const { productId, agencyId } = req.params;

    // Check if user has permission (admin or agency owner)
    if (!req.user || (req.user.role !== 'admin' && req.user.role !== 'agency_owner')) {
      return next(createError(403, 'Only admin or agency owner can manage inventory'));
    }

    // If agency owner, ensure they can only manage their own agency
    if (req.user.role === 'agency_owner' && req.user.agencyId !== agencyId) {
      return next(createError(403, 'You can only manage your own agency inventory'));
    }

    // Validate request body
    const { error, value } = agencyInventorySchema.validate(req.body);
    if (error) {
      return next(createError(400, error.details[0].message));
    }

    // Find inventory
    const inventory = await AgencyInventory.findOne({
      where: { productId: productId, agencyId: agencyId },
      include: [
        { model: Product, as: 'Product' },
        { model: Agency, as: 'Agency' }
      ]
    });

    if (!inventory) {
      return next(createError(404, 'Inventory not found'));
    }

    // Update inventory
    await inventory.update(value);

    logger.info(`Agency inventory updated: ${inventory.Product.productName} -> ${inventory.Agency.name}`);

    // Emit socket notification
    const socketService = global.socketService;
    logger.info(`🔌 Socket service available: ${!!socketService}`);
    if (socketService) {
      const inventoryData = {
        productId: inventory.Product.id,
        productName: inventory.Product.productName,
        agencyId: inventory.Agency.id,
        agencyName: inventory.Agency.name,
        stock: inventory.stock,
        lowStockThreshold: inventory.lowStockThreshold,
        isActive: inventory.isActive,
        action: 'updated'
      };
      
      logger.info(`📤 Emitting inventory update with data:`, JSON.stringify(inventoryData, null, 2));
      socketService.emitInventoryUpdated(inventoryData);

      // Check for low stock alert
      if (inventory.stock <= inventory.lowStockThreshold) {
        socketService.emitLowStockAlert({
          productId: inventory.Product.id,
          productName: inventory.Product.productName,
          agencyId: inventory.Agency.id,
          agencyName: inventory.Agency.name,
          stock: inventory.stock,
          lowStockThreshold: inventory.lowStockThreshold
        });
      }
    }

    res.status(200).json({
      success: true,
      message: 'Agency inventory updated successfully',
      data: { inventory }
    });
  } catch (error) {
    next(error);
  }
};

// Admin: Update ANY agency's stock (Admin-only - clearer function)
const adminUpdateAgencyStock = async (req, res, next) => {
  try {
    const { productId, agencyId } = req.params;

    // Admin-only check
    if (!req.user || req.user.role !== 'admin') {
      return next(createError(403, 'Only admin can perform this action'));
    }

    // Validate request body
    const { error, value } = agencyInventorySchema.validate(req.body);
    if (error) {
      return next(createError(400, error.details[0].message));
    }

    // Check if product exists
    const product = await Product.findByPk(productId);
    if (!product) {
      return next(createError(404, 'Product not found'));
    }

    // Check if agency exists
    const agency = await Agency.findByPk(agencyId);
    if (!agency) {
      return next(createError(404, 'Agency not found'));
    }

    // Find inventory
    let inventory = await AgencyInventory.findOne({
      where: { productId: productId, agencyId: agencyId }
    });

    if (!inventory) {
      return next(createError(404, 'Inventory not found. Please add this product to agency first.'));
    }

    // Update inventory
    await inventory.update(value);

    // Reload with associations
    inventory = await AgencyInventory.findOne({
      where: { productId: productId, agencyId: agencyId },
      include: [
        { model: Product, as: 'Product' },
        { model: Agency, as: 'Agency' }
      ]
    });

    logger.info(`Admin updated agency inventory: ${inventory.Product.productName} -> ${inventory.Agency.name}`);

    // Emit socket notification
    const socketService = global.socketService;
    if (socketService) {
      const inventoryData = {
        productId: inventory.Product.id,
        productName: inventory.Product.productName,
        agencyId: inventory.Agency.id,
        agencyName: inventory.Agency.name,
        stock: inventory.stock,
        lowStockThreshold: inventory.lowStockThreshold,
        isActive: inventory.isActive,
        agencyVariants: inventory.agencyVariants,
        action: 'admin_updated'
      };
      
      socketService.emitInventoryUpdated(inventoryData);

      // Check for low stock alert
      if (inventory.agencyVariants && inventory.agencyVariants.length > 0) {
        // Check variants for low stock
        inventory.agencyVariants.forEach(variant => {
          if (variant.stock <= inventory.lowStockThreshold) {
            socketService.emitLowStockAlert({
              productId: inventory.Product.id,
              productName: inventory.Product.productName,
              variantLabel: variant.label,
              agencyId: inventory.Agency.id,
              agencyName: inventory.Agency.name,
              stock: variant.stock,
              lowStockThreshold: inventory.lowStockThreshold
            });
          }
        });
      }
    }

    res.status(200).json({
      success: true,
      message: `Agency stock updated successfully by admin`,
      data: {
        productId: inventory.Product.id,
        productName: inventory.Product.productName,
        agencyId: inventory.Agency.id,
        agencyName: inventory.Agency.name,
        stock: inventory.stock,
        lowStockThreshold: inventory.lowStockThreshold,
        agencyPrice: inventory.agencyPrice,
        agencyVariants: inventory.agencyVariants,
        isActive: inventory.isActive,
        updatedAt: inventory.updatedAt
      }
    });
  } catch (error) {
    next(error);
  }
};

// Remove product from agency inventory
const removeProductFromAgency = async (req, res, next) => {
  try {
    const { productId, agencyId } = req.params;

    // Check if user has permission (admin or agency owner)
    if (!req.user || (req.user.role !== 'admin' && req.user.role !== 'agency_owner')) {
      return next(createError(403, 'Only admin or agency owner can manage inventory'));
    }

    // If agency owner, ensure they can only manage their own agency
    if (req.user.role === 'agency_owner' && req.user.agencyId !== agencyId) {
      return next(createError(403, 'You can only manage your own agency inventory'));
    }

    // Find inventory
    const inventory = await AgencyInventory.findOne({
      where: { productId: productId, agencyId: agencyId },
      include: [
        { model: Product, as: 'Product' },
        { model: Agency, as: 'Agency' }
      ]
    });

    if (!inventory) {
      return next(createError(404, 'Inventory not found'));
    }

    await inventory.destroy();

    logger.info(`Product removed from agency inventory: ${inventory.Product.productName} -> ${inventory.Agency.name}`);

    res.status(200).json({
      success: true,
      message: 'Product removed from agency inventory successfully'
    });
  } catch (error) {
    next(error);
  }
};

// Get agency inventory
const getAgencyInventory = async (req, res, next) => {
  try {
    const { agencyId } = req.params;
    const { page = 1, limit = 10, search, lowStock } = req.query;
    const offset = (page - 1) * limit;

    // Check if user has permission (admin or agency owner)
    if (!req.user || (req.user.role !== 'admin' && req.user.role !== 'agency_owner')) {
      return next(createError(403, 'Only admin or agency owner can view inventory'));
    }

    // If agency owner, ensure they can only view their own agency
    if (req.user.role === 'agency_owner' && req.user.agencyId !== agencyId) {
      return next(createError(403, 'You can only view your own agency inventory'));
    }

    // Build where clause
    const whereClause = { agencyId: agencyId };
    
    if (lowStock === 'true') {
      whereClause[Op.and] = [
        Sequelize.where(
          Sequelize.col('stock'),
          { [Op.lte]: Sequelize.col('lowStockThreshold') }
        )
      ];
    }

    // Build include options
    const includeOptions = [
      {
        model: Product,
        as: 'Product',
        where: search ? {
          [Op.or]: [
            { productName: { [Op.iLike]: `%${search}%` } },
            { description: { [Op.iLike]: `%${search}%` } }
          ]
        } : undefined,
        required: true
      }
    ];

    const inventory = await AgencyInventory.findAndCountAll({
      where: whereClause,
      include: includeOptions,
      limit: parseInt(limit),
      offset: parseInt(offset),
      order: [['createdAt', 'DESC']]
    });

    const totalPages = Math.ceil(inventory.count / limit);

    res.status(200).json({
      success: true,
      message: 'Agency inventory retrieved successfully',
      data: {
        inventory: inventory.rows,
        pagination: {
          currentPage: parseInt(page),
          totalPages,
          totalItems: inventory.count,
          itemsPerPage: parseInt(limit)
        }
      }
    });
  } catch (error) {
    next(error);
  }
};

// Get all agency inventory (Admin only)
const getAllAgencyInventory = async (req, res, next) => {
  try {
    // Only admin can view all agency inventory
    if (!req.user || req.user.role !== 'admin') {
      return next(createError(403, 'Only admin can view all agency inventory'));
    }

    const { page = 1, limit = 10, agencyId, productId, lowStock } = req.query;
    const offset = (page - 1) * limit;

    // Build where clause
    const whereClause = {};
    
    if (agencyId) {
      whereClause.agencyId = agencyId;
    }
    
    if (productId) {
      whereClause.productId = productId;
    }
    
    if (lowStock === 'true') {
      whereClause[Op.and] = [
        Sequelize.where(
          Sequelize.col('stock'),
          { [Op.lte]: Sequelize.col('lowStockThreshold') }
        )
      ];
    }

    const inventory = await AgencyInventory.findAndCountAll({
      where: whereClause,
      include: [
        {
          model: Product,
          as: 'Product',
          attributes: ['id', 'productName', 'description', 'category', 'status']
        },
        {
          model: Agency,
          as: 'Agency',
          attributes: ['id', 'name', 'email', 'phone', 'city', 'status']
        }
      ],
      limit: parseInt(limit),
      offset: parseInt(offset),
      order: [['createdAt', 'DESC']]
    });

    const totalPages = Math.ceil(inventory.count / limit);

    res.status(200).json({
      success: true,
      message: 'All agency inventory retrieved successfully',
      data: {
        inventory: inventory.rows,
        pagination: {
          currentPage: parseInt(page),
          totalPages,
          totalItems: inventory.count,
          itemsPerPage: parseInt(limit)
        }
      }
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  createProductHandler,
  getAllProducts,
  getProductById,
  updateProductHandler,
  deleteProduct,
  updateProductStatus,
  getProductsByStatus,
  addProductToAgency,
  updateAgencyInventory,
  adminUpdateAgencyStock,
  removeProductFromAgency,
  getAgencyInventory,
  getAllAgencyInventory
};
