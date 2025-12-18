const { Order, DeliveryAgent, Product, Tax, PlatformCharge, Coupon, DeliveryCharge, Agency, User, AgencyOwner, Notification, AgencyInventory } = require('../models');
const { createOrder, updateOrderStatus, assignAgent, sendOTP, verifyOTP, cancelOrder, returnOrder, markPaymentReceived } = require('../validations/orderValidation');
const { createError } = require('../utils/errorHandler');
const { sendEmail } = require('../config/email');
const {
  generateOrderNumber,
  generateOTP,
  calculateOrderTotals,
  validateOTP,
  formatOrderResponse,
  restoreStockToAgency,
  NOTIFICATION_TYPES,
  createNotificationPayload
} = require('../utils/orderUtils');
const logger = require('../utils/logger');
const { Op, sequelize } = require('sequelize');
const axios = require("axios");
const notificationService = require('../services/notificationService');

// Get socket service instance
const getSocketService = () => {
  return global.socketService;
};

// Create new order (Customer checkout)
const createOrderHandler = async (req, res, next) => {
  try {
    // Validate request body
    const { error, value } = createOrder.validate(req.body);
    if (error) {
      return next(createError(400, error.details[0].message));
    }

    // Get tax configuration first
    const taxConfig = await Tax.findOne({ where: { isActive: true } });
    const platformChargeConfig = await PlatformCharge.findOne({ where: { isActive: true } });

    let taxPercentage = 0;
    let fixedTaxAmount = 0;
    let taxType = 'none';
    let taxValue = 0;
    let platformChargeAmount = 0;

    if (taxConfig) {
      if (taxConfig.percentage !== null && taxConfig.percentage > 0) {
        taxPercentage = parseFloat(taxConfig.percentage);
        taxType = 'percentage';
        taxValue = taxPercentage;
      } else if (taxConfig.fixedAmount !== null && taxConfig.fixedAmount > 0) {
        fixedTaxAmount = parseFloat(taxConfig.fixedAmount);
        taxType = 'fixed';
        taxValue = fixedTaxAmount;
      }
    }

    // Get platform charge
    if (platformChargeConfig && platformChargeConfig.amount > 0) {
      platformChargeAmount = parseFloat(platformChargeConfig.amount);
    }

    // Verify each item's price from database and calculate correct amounts
    const agencyId = value.agencyId;

    let calculatedSubtotal = 0;
    const validatedItems = [];

    for (const item of value.items) {
      // Fetch product from database
      const product = await Product.findByPk(item.productId);
      if (!product) {
        return next(createError(404, `Product with ID ${item.productId} not found`));
      }

      // Get inventory for this product in the agency
      const inventory = await AgencyInventory.findOne({
        where: {
          productId: item.productId,
          agencyId: agencyId,
          isActive: true
        }
      });

      if (!inventory) {
        return next(createError(400, `Product ${product.productName} is not available in the selected agency`));
      }

      // Find the correct variant price
      let actualPrice = null;
      let variantFound = false;

      if (item.variantLabel && inventory.agencyVariants && Array.isArray(inventory.agencyVariants)) {
        const variant = inventory.agencyVariants.find(v => v.label === item.variantLabel);
        if (variant) {
          actualPrice = parseFloat(variant.price);
          variantFound = true;
        }
      }

      if (!variantFound) {
        return next(createError(400, `Variant ${item.variantLabel} not found for product ${product.productName}`));
      }

      // Validate that customer sent correct price
      const customerSentPrice = parseFloat(item.variantPrice);
      if (Math.abs(customerSentPrice - actualPrice) > 0.01) {
        return next(createError(400, `Invalid price for ${product.productName} (${item.variantLabel}). Expected: $${actualPrice}, Got: $${customerSentPrice}`));
      }

      // Calculate product amount (without tax)
      const productAmount = actualPrice * item.quantity;

      // Calculate tax for this item
      let itemTaxAmount = 0;
      if (taxType === 'percentage') {
        itemTaxAmount = (productAmount * taxPercentage) / 100;
      } else if (taxType === 'fixed') {
        // For fixed tax, distribute proportionally based on item contribution
        // We'll calculate total contribution later
        itemTaxAmount = 0; // Will be calculated after loop
      }

      // Calculate item total (product amount + tax)
      const itemTotal = productAmount + itemTaxAmount;

      calculatedSubtotal += productAmount;

      // Create validated item with all details
      validatedItems.push({
        productId: item.productId,
        productName: product.productName,
        variantLabel: item.variantLabel,
        variantPrice: actualPrice,
        quantity: item.quantity,
        productAmount: parseFloat(productAmount.toFixed(2)),
        taxAmount: parseFloat(itemTaxAmount.toFixed(2)), // Will be updated for fixed tax
        total: parseFloat(itemTotal.toFixed(2)) // Will be updated for fixed tax
      });
    }

    // Calculate total tax amount
    let totalTaxAmount = 0;
    if (taxType === 'percentage') {
      totalTaxAmount = (calculatedSubtotal * taxPercentage) / 100;
      // Tax already calculated per item above
    } else if (taxType === 'fixed') {
      totalTaxAmount = fixedTaxAmount;
      // Distribute fixed tax proportionally
      validatedItems.forEach(item => {
        const proportion = item.productAmount / calculatedSubtotal;
        const itemTax = fixedTaxAmount * proportion;
        item.taxAmount = parseFloat(itemTax.toFixed(2));
        item.total = parseFloat((item.productAmount + item.taxAmount).toFixed(2));
      });
    }

    // Apply coupon if provided (coupon applies on subtotal only)
    let couponCode = null;
    let couponDiscount = 0;

    if (value.couponCode && value.couponCode.trim() !== '') {
      // Find and validate coupon
      const coupon = await Coupon.findOne({
        where: {
          code: value.couponCode.toUpperCase(),
          agencyId: agencyId,
          isActive: true,
        },
      });

      if (!coupon) {
        return next(createError(400, 'Invalid or inactive coupon code'));
      }

      // Check expiry
      const now = new Date();
      const expiryDateTime = new Date(`${coupon.expiryDate} ${coupon.expiryTime}`);

      if (now > expiryDateTime) {
        // Auto-deactivate expired coupon
        await coupon.update({ isActive: false });
        return next(createError(400, 'Coupon has expired'));
      }

      // Check minimum and maximum amount against subtotal only
      if (calculatedSubtotal < coupon.minAmount) {
        return next(createError(400, `Minimum amount required for this coupon: $${coupon.minAmount}`));
      }

      if (coupon.maxAmount && calculatedSubtotal > coupon.maxAmount) {
        return next(createError(400, `Maximum amount allowed for this coupon: $${coupon.maxAmount}`));
      }

      // Calculate discount on subtotal only
      if (coupon.discountType === 'percentage') {
        couponDiscount = (calculatedSubtotal * coupon.discountValue) / 100;
      } else {
        couponDiscount = parseFloat(coupon.discountValue);
      }

      couponCode = coupon.code;
    }

    // Calculate delivery charge for home_delivery mode
    let deliveryChargeAmount = 0;
    let deliveryDistance = null;

    if (value.deliveryMode === 'home_delivery') {
      try {
        // Get customer user to access addresses
        const customer = await User.findOne({
          where: { email: value.customerEmail }
        });

        if (customer && customer.addresses && Array.isArray(customer.addresses) && customer.addresses.length > 0) {
          // Use customer's first address or find matching address
          const customerAddressObj = customer.addresses[0];

          // Get delivery charge configuration for agency
          const deliveryChargeConfig = await DeliveryCharge.findOne({
            where: {
              agencyId: agencyId,
              status: 'active'
            }
          });

          if (deliveryChargeConfig) {
            // Get agency details - already fetched below, so we'll move agency fetch here
            const Agency = require('../models/Agency');
            const agency = await Agency.findByPk(agencyId);

            if (agency) {
              // Calculate distance using Google Maps API
              const axios = require('axios');
              const customerFullAddress = `${customerAddressObj.address}, ${customerAddressObj.city}, ${customerAddressObj.pincode}`;
              const agencyFullAddress = `${agency.address}, ${agency.city}, ${agency.pincode}`;

              const apiKey = process.env.GOOGLE_MAPS_API_KEY || 'AIzaSyBXNyT9zcGdvhAUCUEYTm6e_qPw26AOPgI';

              const response = await axios.get('https://maps.googleapis.com/maps/api/distancematrix/json', {
                params: {
                  origins: agencyFullAddress,
                  destinations: customerFullAddress,
                  key: apiKey,
                  mode: 'driving',
                  units: 'metric'
                }
              });

              if (response.data.status === 'OK' && response.data.rows[0].elements[0].status === 'OK') {
                const distanceInMeters = response.data.rows[0].elements[0].distance.value;
                const distanceInKm = distanceInMeters / 1000;
                deliveryDistance = parseFloat(distanceInKm.toFixed(2));

                const deliveryRadius = parseFloat(deliveryChargeConfig.deliveryRadius);

                // Check if within delivery radius
                if (distanceInKm <= deliveryRadius) {
                  // Calculate delivery charge based on type
                  if (deliveryChargeConfig.chargeType === 'fixed') {
                    deliveryChargeAmount = Math.floor(parseFloat(deliveryChargeConfig.fixedAmount));
                  } else if (deliveryChargeConfig.chargeType === 'per_km') {
                    const ratePerKm = parseFloat(deliveryChargeConfig.ratePerKm);
                    deliveryChargeAmount = Math.floor(distanceInKm * ratePerKm);
                  }
                } else {
                  return next(createError(400, `Delivery not available. Customer location is ${distanceInKm} km away, but delivery is only available within ${deliveryRadius} km radius.`));
                }
              }
            }
          }
        }
      } catch (err) {
        logger.error('Error calculating delivery charge:', err);
        // Continue without delivery charge if calculation fails
      }
    }

    // Distribute platform charge proportionally across items
    validatedItems.forEach(item => {
      item.taxValue = taxValue;

      // Calculate proportional platform charge for this item
      const proportion = item.productAmount / calculatedSubtotal;
      const itemPlatformCharge = platformChargeAmount * proportion;
      item.platformCharge = parseFloat(itemPlatformCharge.toFixed(2));

      // Update item total to include platform charge
      item.total = parseFloat((item.productAmount + item.taxAmount + item.platformCharge).toFixed(2));
    });

    // Calculate final total amount (subtotal + tax + platformCharge + deliveryCharge - couponDiscount)
    const totalAmount = calculatedSubtotal + totalTaxAmount + platformChargeAmount + deliveryChargeAmount - couponDiscount;

    // Generate order number
    const orderNumber = generateOrderNumber();

    // Verify the agency exists and is active
    const agency = await Agency.findByPk(agencyId);
    if (!agency) {
      return next(createError(404, `Agency with ID ${agencyId} not found`));
    }
    if (agency.status !== 'active') {
      return next(createError(400, `Agency ${agency.name} is not active`));
    }

    // Verify stock availability for validated items
    for (const item of validatedItems) {
      const inventory = await AgencyInventory.findOne({
        where: {
          productId: item.productId,
          agencyId: agencyId,
          isActive: true
        }
      });

      // Check stock availability for variant
      let availableStock = 0;
      let stockMessage = `variant ${item.variantLabel} of ${item.productName}`;

      if (inventory && inventory.agencyVariants && Array.isArray(inventory.agencyVariants)) {
        const variant = inventory.agencyVariants.find(v => v.label === item.variantLabel);
        if (variant) {
          availableStock = variant.stock || 0;
        }
      }

      if (availableStock < item.quantity) {
        return next(createError(400, `Insufficient stock for ${stockMessage}. Available: ${availableStock}, Requested: ${item.quantity}`));
      }
    }

    // Create order with validated items, tax details, platform charge, delivery charge, and coupon
    const order = await Order.create({
      orderNumber,
      customerName: value.customerName,
      customerEmail: value.customerEmail,
      customerPhone: value.customerPhone,
      customerAddress: value.customerAddress || null,
      deliveryMode: value.deliveryMode,
      items: validatedItems,
      subtotal: parseFloat(calculatedSubtotal.toFixed(2)),
      taxType: taxType,
      taxValue: parseFloat(taxValue.toFixed(2)),
      taxAmount: parseFloat(totalTaxAmount.toFixed(2)),
      platformCharge: parseFloat(platformChargeAmount.toFixed(2)),
      deliveryCharge: parseFloat(deliveryChargeAmount.toFixed(2)),
      deliveryDistance: deliveryDistance,
      couponCode: couponCode,
      couponDiscount: parseFloat(couponDiscount.toFixed(2)),
      totalAmount: parseFloat(totalAmount.toFixed(2)),
      paymentMethod: value.paymentMethod,
      status: 'pending',
      agencyId: agencyId
    });


  

    // Reduce stock in agency inventory using validated items
    for (const item of validatedItems) {
      // Get current inventory to check if we need to update variants
      const inventory = await AgencyInventory.findOne({
        where: {
          productId: item.productId,
          agencyId: agencyId
        }
      });

      if (inventory) {
        // If item has variant information, update variant stock
        if (item.variantLabel && inventory.agencyVariants && Array.isArray(inventory.agencyVariants)) {
          const updatedVariants = inventory.agencyVariants.map(variant => {
            if (variant.label === item.variantLabel) {
              return {
                ...variant,
                stock: Math.max(0, (variant.stock || 0) - item.quantity)
              };
            }
            return variant;
          });

          await inventory.update({
            agencyVariants: updatedVariants
          });
        }
      }
    }

    logger.info(`Order created: ${order.orderNumber} for agency: ${agencyId}`);

    // Emit socket notification
    const socketService = getSocketService();
    if (socketService) {
      socketService.emitOrderCreated({
        orderId: order.id,
        orderNumber: order.orderNumber,
        customerName: order.customerName,
        customerEmail: order.customerEmail,
        subtotal: order.subtotal,
        taxType: order.taxType,
        taxValue: order.taxValue,
        taxAmount: order.taxAmount,
        platformCharge: order.platformCharge,
        couponCode: order.couponCode,
        couponDiscount: order.couponDiscount,
        totalAmount: order.totalAmount,
        agencyId: agencyId,
        status: order.status
      });
    }

    // Create notifications for customer and agency owner
    try {
      // 1. Create notification for customer (who created the order)
      const customer = await User.findOne({ where: { email: order.customerEmail } });
      if (customer) {
        await Notification.create({
          userId: customer.id,
          title: 'Order Placed Successfully!',
          content: `Your order #${order.orderNumber} has been placed successfully. Total amount: ₹${order.totalAmount}`,
          notificationType: 'ORDER_STATUS',
          data: {
            type: 'ORDER_STATUS',
            orderId: order.id,
            orderNumber: order.orderNumber,
            status: 'pending'
          },
          orderId: order.id
        });
      }

      // 2. Create notification for agency owner
      const agencyOwner = await AgencyOwner.findOne({ where: { agencyId: agencyId } });
      if (agencyOwner) {
        // Find agency owner's user account by email
        const agencyOwnerUser = await User.findOne({ where: { email: agencyOwner.email } });
        if (agencyOwnerUser) {
          await Notification.create({
            userId: agencyOwnerUser.id,
            title: 'New Order Received! ',
            content: `New order #${order.orderNumber} received from ${order.customerName}. Total: ₹${order.totalAmount}`,
            notificationType: 'NEW_ORDER',
            data: {
              type: 'NEW_ORDER',
              orderId: order.id,
              orderNumber: order.orderNumber,
              total: order.totalAmount
            },
            orderId: order.id
          });
        }

        // Send Firebase notification to agency owner about new order
        if (agencyOwner.fcmToken) {
          await notificationService.sendNewOrderToAgency(agencyOwner.fcmToken, {
            id: order.id,
            orderNumber: order.orderNumber,
            total: order.totalAmount,
            agencyId: agencyId
          }, {
            recipientType: 'agency',
            recipientId: agencyOwnerUser ? agencyOwnerUser.id : null,
            orderId: order.id,
            agencyId: agencyId,
            notificationType: 'NEW_ORDER'
          });
        }
      }
    } catch (notifError) {
      logger.error('Error creating notifications:', notifError.message);
    }

    res.status(201).json({
      success: true,
      message: 'Order created successfully',
      data: {
        order: formatOrderResponse(order)
      }
    });
  } catch (error) {
    next(error);
  }
};

// Get all orders (Role-based filtering)
const getAllOrders = async (req, res, next) => {
  try {
    const { page = 1, limit = 10, status, search, id, agentId, startDate, endDate } = req.query;
    const offset = (page - 1) * limit;
    const userRole = req.user.role;
    const userEmail = req.user.email;

    // If ID is provided, get specific order
    if (id) {
      const order = await Order.findByPk(id, {
        include: [
          {
            model: DeliveryAgent,
            as: 'DeliveryAgent',
            attributes: ['id', 'name', 'phone', 'vehicleNumber']
          },
          {
            model: require('../models').Agency,
            as: 'Agency',
            attributes: ['id', 'name', 'email', 'phone', 'city', 'status']
          }
        ]
      });

      if (!order) {
        return next(createError(404, 'Order not found'));
      }

      // Check if user can access this order
      if (userRole === 'customer' && order.customerEmail !== userEmail) {
        return next(createError(403, 'Access denied. You can only view your own orders'));
      }

      if (userRole === 'agent' && order.assignedAgentId !== req.user.deliveryAgentId) {
        return next(createError(403, 'Access denied. You can only view orders assigned to you'));
      }

      if (userRole === 'agency_owner' && order.agencyId !== req.user.agencyId) {
        return next(createError(403, 'Access denied. You can only view orders for your agency'));
      }

      return res.status(200).json({
        success: true,
        message: 'Order retrieved successfully',
        data: {
          order: formatOrderResponse(order, true)
        }
      });
    }

    // Build where clause based on user role
    const whereClause = {};

    if (status) {
      whereClause.status = status;
    }

    if (search) {
      whereClause[Op.or] = [
        { orderNumber: { [Op.iLike]: `%${search}%` } },
        { customerName: { [Op.iLike]: `%${search}%` } },
        { customerEmail: { [Op.iLike]: `%${search}%` } },
        { customerPhone: { [Op.iLike]: `%${search}%` } }
      ];
    }

    // Date filtering
    if (startDate || endDate) {
      whereClause.createdAt = {};
      if (startDate) {
        whereClause.createdAt[Op.gte] = new Date(startDate);
      }
      if (endDate) {
        // Add 23:59:59 to endDate to include the entire day
        const endDateTime = new Date(endDate);
        endDateTime.setHours(23, 59, 59, 999);
        whereClause.createdAt[Op.lte] = endDateTime;
      }
    }

    // Role-based filtering
    if (userRole === 'customer') {
      // Customer can only see their own orders
      whereClause.customerEmail = userEmail;
    } else if (userRole === 'agent') {
      // Agent can see orders assigned to them
      if (!req.user.deliveryAgentId) {
        return next(createError(400, 'Agent profile not properly linked. Please contact admin.'));
      }
      whereClause.assignedAgentId = req.user.deliveryAgentId;

      // If no specific status is requested, show active orders (assigned + out_for_delivery)
      // If specific status is requested, respect that filter
      if (!status) {
        whereClause.status = { [Op.in]: ['assigned', 'out_for_delivery'] };
      }
    } else if (userRole === 'agency_owner') {
      // Agency owner can only see orders for their agency
      if (!req.user.agencyId) {
        return next(createError(400, 'Agency profile not properly linked. Please contact admin.'));
      }
      whereClause.agencyId = req.user.agencyId;
    }
    // Admin can see all orders (no additional filtering)

    // Filter by agent if provided (admin only)
    if (agentId && userRole === 'admin') {
      whereClause.assignedAgentId = agentId;
    }

    // First get count separately for better performance
    const count = await Order.count({
      where: whereClause,
      distinct: true
    });

    // Then get the actual records
    const orders = await Order.findAll({
      where: whereClause,
      include: [
        {
          model: DeliveryAgent,
          as: 'DeliveryAgent',
          attributes: ['id', 'name', 'phone', 'vehicleNumber'],
          required: false
        },
        {
          model: require('../models').Agency,
          as: 'Agency',
          attributes: ['id', 'name', 'email', 'phone', 'city', 'status'],
          required: false
        }
      ],
      attributes: [
        'id', 'orderNumber', 'customerName', 'customerEmail', 'customerPhone',
        'customerAddress', 'deliveryMode', 'status', 'items', 'subtotal',
        'taxType', 'taxValue', 'taxAmount', 'platformCharge', 'deliveryCharge',
        'couponCode', 'couponDiscount', 'totalAmount', 'paymentMethod',
        'paymentStatus', 'paymentReceived', 'agencyId', 'assignedAgentId',
        'createdAt', 'updatedAt', 'confirmedAt', 'assignedAt',
        'outForDeliveryAt', 'deliveredAt', 'cancelledAt'
      ],
      limit: Math.min(parseInt(limit), 50), // Reduced from 100 to 50
      offset: parseInt(offset),
      order: [['createdAt', 'DESC']],
      raw: false,
      nest: true
    });

    const totalPages = Math.ceil(count / limit);

    res.status(200).json({
      success: true,
      message: 'Orders retrieved successfully',
      data: {
        orders: orders.map(order => formatOrderResponse(order, true)),
        pagination: {
          currentPage: parseInt(page),
          totalPages,
          totalItems: count,
          itemsPerPage: parseInt(limit)
        },
        userRole,
        filteredBy: userRole === 'customer' ? 'customer_email' :
          userRole === 'agent' ? 'assigned_agent_id' : 'all_orders'
      }
    });
  } catch (error) {
    // Handle specific database errors
    if (error.message && error.message.includes('out of shared memory')) {
      logger.error('Database shared memory error in getAllOrders:', error);
      return next(createError(503, 'Service temporarily unavailable. Please try again in a moment.'));
    }

    if (error.name === 'SequelizeConnectionError' ||
      error.name === 'SequelizeConnectionRefusedError' ||
      error.name === 'SequelizeConnectionTimedOutError') {
      logger.error('Database connection error in getAllOrders:', error);
      return next(createError(503, 'Database connection error. Please try again.'));
    }

    logger.error('Error in getAllOrders:', error);
    next(error);
  }
};

// Update order status (Admin)
const updateOrderStatusHandler = async (req, res, next) => {
  try {
    const { id } = req.params;

    // Validate request body
    const { error, value } = updateOrderStatus.validate(req.body);
    if (error) {
      return next(createError(400, error.details[0].message));
    }

    const order = await Order.findByPk(id);
    if (!order) {
      return next(createError(404, 'Order not found'));
    }

    // Update order with timestamp
    const updateData = { status: value.status };

    if (value.status === 'confirmed' && order.status === 'pending') {
      updateData.confirmedAt = new Date();
    } else if (value.status === 'out_for_delivery' && order.status === 'assigned') {
      updateData.outForDeliveryAt = new Date();
    } else if (value.status === 'delivered' && order.status === 'out_for_delivery') {
      updateData.deliveredAt = new Date();
      // Auto-update payment status to "paid" if order is delivered and payment received
      if (order.paymentReceived === true) {
        updateData.paymentStatus = 'paid';
      }
    } else if (value.status === 'cancelled' && order.status !== 'delivered') {
      updateData.cancelledAt = new Date();

      // Track who cancelled the order
      let cancelledBy = 'system';
      let cancelledById = null;
      let cancelledByName = 'System';

      if (req.user) {
        switch (req.user.role) {
          case 'admin':
            cancelledBy = 'admin';
            cancelledById = req.user.id;
            cancelledByName = req.user.name || req.user.email;
            break;
          case 'agency':
            cancelledBy = 'agency';
            cancelledById = req.user.id;
            cancelledByName = req.user.name || req.user.email;
            break;
          case 'customer':
            cancelledBy = 'customer';
            cancelledById = req.user.id;
            cancelledByName = req.user.name || req.user.email;
            break;
        }
      }

      updateData.cancelledBy = cancelledBy;
      updateData.cancelledById = cancelledById;
      updateData.cancelledByName = cancelledByName;
    }

    if (value.adminNotes) updateData.adminNotes = value.adminNotes;
    if (value.agentNotes) updateData.agentNotes = value.agentNotes;

    await order.update(updateData);

    // Restore stock when order is cancelled via status update
    if (value.status === 'cancelled') {
      await restoreStockToAgency(order);

      const cancelledByName = updateData.cancelledByName || 'System';
      const cancelledBy = updateData.cancelledBy || 'system';
      logger.info(`Order cancelled: ${order.orderNumber} by ${cancelledByName} (${cancelledBy}) - Stock restored to agency inventory`);
    } else {
      logger.info(`Order status updated: ${order.orderNumber} - ${value.status}`);
    }

    // Send email notification
    if (value.status === 'confirmed') {
      await sendEmail(order.customerEmail, 'orderConfirmation', formatOrderResponse(order));
    } else if (value.status === 'cancelled') {
      await sendEmail(order.customerEmail, 'orderCancelled', formatOrderResponse(order), value.adminNotes);
    }

    // Emit socket notification
    const socketService = getSocketService();
    if (socketService) {
      socketService.emitOrderStatusUpdated({
        orderId: order.id,
        orderNumber: order.orderNumber,
        status: value.status,
        customerEmail: order.customerEmail,
        agencyId: order.agencyId,
        assignedAgentId: order.assignedAgentId
      });
    }

    // Send Firebase notification to customer about status update
    try {
      const customer = await User.findOne({ where: { email: order.customerEmail } });
      if (customer) {
        // Send Firebase push notification
        if (customer.fcmToken) {
          await notificationService.sendOrderStatusNotification(customer.fcmToken, {
            id: order.id,
            orderNumber: order.orderNumber,
            status: value.status
          });
        }

        // Create database notification
        const statusMessages = {
          'confirmed': `Your order #${order.orderNumber} has been confirmed.`,
          'assigned': `Agent has been assigned to your order #${order.orderNumber}.`,
          'out_for_delivery': `Your order #${order.orderNumber} is out for delivery.`,
          'delivered': `Your order #${order.orderNumber} has been delivered successfully.`,
          'cancelled': `Your order #${order.orderNumber} has been cancelled.`
        };

        const notificationTitle = {
          'confirmed': 'Order Confirmed!',
          'assigned': 'Agent Assigned!',
          'out_for_delivery': 'Order Out for Delivery!',
          'delivered': 'Order Delivered!',
          'cancelled': 'Order Cancelled'
        };

        await Notification.create({
          userId: customer.id,
          title: notificationTitle[value.status] || 'Order Status Updated',
          content: statusMessages[value.status] || `Your order #${order.orderNumber} status has been updated to ${value.status}.`,
          notificationType: 'ORDER_STATUS',
          data: {
            type: 'ORDER_STATUS',
            orderId: order.id,
            orderNumber: order.orderNumber,
            status: value.status
          },
          orderId: order.id
        });
      }
    } catch (notifError) {
      logger.error('Error sending order status notification:', notifError.message);
    }

    res.status(200).json({
      success: true,
      message: 'Order status updated successfully',
      data: {
        order: formatOrderResponse(order)
      }
    });
  } catch (error) {
    next(error);
  }
};

// Assign agent to order (Admin)
const assignAgentHandler = async (req, res, next) => {
  try {
    const { id } = req.params;

    // Validate request body
    const { error, value } = assignAgent.validate(req.body);
    if (error) {
      return next(createError(400, error.details[0].message));
    }

    const order = await Order.findByPk(id);
    if (!order) {
      return next(createError(404, 'Order not found'));
    }

    const agent = await DeliveryAgent.findByPk(value.agentId);
    if (!agent) {
      return next(createError(404, 'Delivery agent not found'));
    }

    // Check if agent belongs to the same agency as the order
    if (agent.agencyId !== order.agencyId) {
      return next(createError(400, 'Agent must belong to the same agency as the order'));
    }

    // Update order
    await order.update({
      assignedAgentId: value.agentId,
      status: 'assigned',
      assignedAt: new Date()
    });

    logger.info(`Order assigned to agent: ${order.orderNumber} - ${agent.name}`);

    // Send email notification
    await sendEmail(order.customerEmail, 'orderAssigned', formatOrderResponse(order), agent);

    // Emit socket notification
    const socketService = getSocketService();
    if (socketService) {
      socketService.emitOrderAssigned({
        orderId: order.id,
        orderNumber: order.orderNumber,
        agentId: agent.id,
        agentName: agent.name,
        assignedAgentId: agent.id,
        customerEmail: order.customerEmail,
        agencyId: order.agencyId
      });
    }

    // Send Firebase notification to delivery agent about new assignment
    try {
      // Find agent's user account by email or phone
      const agentUser = await User.findOne({ 
        where: { 
          [Op.or]: [
            { email: agent.email },
            { phone: agent.phone }
          ]
        } 
      });

      // Send Firebase notification to agent
      if (agent.fcmToken) {
        await notificationService.sendOrderAssignedToAgent(agent.fcmToken, {
          id: order.id,
          orderNumber: order.orderNumber,
          deliveryAddress: order.customerAddress
        }, {
          recipientType: 'agent',
          recipientId: agentUser ? agentUser.id : null,
          orderId: order.id,
          agencyId: order.agencyId,
          agentId: agent.id,
          notificationType: 'ORDER_ASSIGNED'
        });
      }

      // Create database notification for agent
      if (agentUser) {
        await Notification.create({
          userId: agentUser.id,
          title: 'New Order Assigned!',
          content: `You have been assigned to order #${order.orderNumber}. Delivery address: ${order.customerAddress}`,
          notificationType: 'ORDER_ASSIGNED',
          data: {
            type: 'ORDER_ASSIGNED',
            orderId: order.id,
            orderNumber: order.orderNumber,
            deliveryAddress: order.customerAddress,
            customerName: order.customerName,
            customerPhone: order.customerPhone
          },
          orderId: order.id
        });
      }
      
      // Also notify customer that agent is assigned
      const customer = await User.findOne({ where: { email: order.customerEmail } });
      if (customer) {
        // Send Firebase notification to customer
        if (customer.fcmToken) {
          await notificationService.sendOrderStatusNotification(customer.fcmToken, {
            id: order.id,
            orderNumber: order.orderNumber,
            status: 'assigned',
            userId: customer.id,
            agencyId: order.agencyId
          }, {
            recipientType: 'user',
            recipientId: customer.id,
            orderId: order.id,
            agencyId: order.agencyId,
            notificationType: 'ORDER_STATUS'
          });
        }

        // Create database notification for customer
        await Notification.create({
          userId: customer.id,
          title: 'Agent Assigned!',
          content: `Agent ${agent.name} has been assigned to your order #${order.orderNumber}.`,
          notificationType: 'ORDER_STATUS',
          data: {
            type: 'ORDER_STATUS',
            orderId: order.id,
            orderNumber: order.orderNumber,
            status: 'assigned',
            agentId: agent.id,
            agentName: agent.name,
            agentPhone: agent.phone
          },
          orderId: order.id
        });
      }
    } catch (notifError) {
      logger.error('Error sending agent assignment notification:', notifError.message);
    }

    res.status(200).json({
      success: true,
      message: 'Order assigned to agent successfully',
      data: {
        order: formatOrderResponse(order),
        agent: {
          id: agent.id,
          name: agent.name,
          phone: agent.phone,
          vehicleNumber: agent.vehicleNumber
        }
      }
    });
  } catch (error) {
    next(error);
  }
};

// Send OTP for delivery (Agent)
const sendOTPHandler = async (req, res, next) => {
  try {
    const { id } = req.params;

    // Validate request body
    const { error } = sendOTP.validate({ orderId: id });
    if (error) {
      return next(createError(400, error.details[0].message));
    }

    const order = await Order.findByPk(id);
    if (!order) {
      return next(createError(404, 'Order not found'));
    }

    if (order.status !== 'assigned' && order.status !== 'out_for_delivery') {
      return next(createError(400, 'Order is not ready for delivery'));
    }

    // Generate OTP
    const otp = generateOTP();
    const otpExpiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

    // Update order
    await order.update({
      deliveryOTP: otp,
      otpExpiresAt,
      status: 'out_for_delivery',
      outForDeliveryAt: new Date()
    });

    logger.info(`OTP sent for order: ${order.orderNumber}`);

    // Send email with OTP
    await sendEmail(order.customerEmail, 'deliveryOTP', { ...formatOrderResponse(order), otp });

    // Emit socket notification
    const socketService = getSocketService();
    if (socketService) {
      socketService.emitOrderStatusUpdated({
        orderId: order.id,
        orderNumber: order.orderNumber,
        status: 'out_for_delivery',
        customerEmail: order.customerEmail,
        agencyId: order.agencyId,
        assignedAgentId: order.assignedAgentId,
        otpSent: true
      });
    }

    // Send Firebase notification to customer about out for delivery
    try {
      const customer = await User.findOne({ where: { email: order.customerEmail } });
      if (customer) {
        // Send Firebase push notification
        if (customer.fcmToken) {
          await notificationService.sendToDevice(
            customer.fcmToken,
            'Out for Delivery!',
            `Your order #${order.orderNumber} is out for delivery. OTP sent to your email.`,
            { type: 'OUT_FOR_DELIVERY', orderId: order.id, orderNumber: order.orderNumber }
          );
        }

        // Create database notification for customer
        await Notification.create({
          userId: customer.id,
          title: 'Order Out for Delivery!',
          content: `Your order #${order.orderNumber} is out for delivery. OTP has been sent to your email.`,
          notificationType: 'ORDER_STATUS',
          data: {
            type: 'ORDER_STATUS',
            orderId: order.id,
            orderNumber: order.orderNumber,
            status: 'out_for_delivery',
            otpSent: true
          },
          orderId: order.id
        });
      }
    } catch (notifError) {
      logger.error('Error sending out for delivery notification:', notifError.message);
    }

    res.status(200).json({
      success: true,
      message: 'OTP sent successfully',
      data: {
        orderId: order.id,
        orderNumber: order.orderNumber,
        otpExpiresAt
      }
    });
  } catch (error) {
    next(error);
  }
};

// Verify OTP and complete delivery (Agent)
const verifyOTPHandler = async (req, res, next) => {
  try {
    const { id } = req.params;

    // Validate request body
    const { error, value } = verifyOTP.validate({ orderId: id, ...req.body });
    if (error) {
      return next(createError(400, error.details[0].message));
    }

    const order = await Order.findByPk(id);
    if (!order) {
      return next(createError(404, 'Order not found'));
    }

    if (order.status !== 'out_for_delivery') {
      return next(createError(400, 'Order is not out for delivery'));
    }

    // Validate OTP
    if (!validateOTP(value.otp, order.deliveryOTP, order.otpExpiresAt)) {
      return next(createError(400, 'Invalid or expired OTP'));
    }

    // Prepare update data
    const updateData = {
      status: 'delivered',
      deliveredAt: new Date(),
      deliveryOTP: null,
      otpExpiresAt: null
    };

    // Add delivery note if provided
    if (value.deliveryNote) {
      updateData.deliveryNote = value.deliveryNote;
    }

    // Add payment received status if provided
    if (value.paymentReceived !== undefined) {
      updateData.paymentReceived = value.paymentReceived;
    }

    // Add delivery proof image if uploaded
    if (req.file && req.file.path) {
      updateData.deliveryProofImage = req.file.path;
    }

    // Auto-update payment status to "paid" if order is delivered and payment received
    if (value.paymentReceived === true) {
      updateData.paymentStatus = 'paid';
    }

    // Update order
    await order.update(updateData);

    logger.info(`Order delivered: ${order.orderNumber} with delivery proof: ${req.file ? 'Yes' : 'No'}`);

    // Send email notification
    await sendEmail(order.customerEmail, 'orderDelivered', formatOrderResponse(order));

    // Emit socket notification
    const socketService = getSocketService();
    if (socketService) {
      socketService.emitOrderDelivered({
        orderId: order.id,
        orderNumber: order.orderNumber,
        deliveryProof: req.file ? true : false,
        paymentReceived: value.paymentReceived || false,
        customerEmail: order.customerEmail,
        agencyId: order.agencyId,
        assignedAgentId: order.assignedAgentId
      });
    }

    // Send Firebase notification to customer about delivery
    try {
      const customer = await User.findOne({ where: { email: order.customerEmail } });
      if (customer) {
        // Send Firebase push notification
        if (customer.fcmToken) {
          await notificationService.sendOrderStatusNotification(customer.fcmToken, {
            id: order.id,
            orderNumber: order.orderNumber,
            status: 'delivered'
          });
        }

        // Create database notification for customer
        await Notification.create({
          userId: customer.id,
          title: 'Order Delivered!',
          content: `Your order #${order.orderNumber} has been delivered successfully.`,
          notificationType: 'ORDER_STATUS',
          data: {
            type: 'ORDER_STATUS',
            orderId: order.id,
            orderNumber: order.orderNumber,
            status: 'delivered',
            paymentReceived: value.paymentReceived || false
          },
          orderId: order.id
        });
      }
      
      // Notify agency owner about completed delivery
      const agencyOwner = await AgencyOwner.findOne({ where: { agencyId: order.agencyId } });
      if (agencyOwner) {
        // Send Firebase push notification
        if (agencyOwner.fcmToken) {
          await notificationService.sendToDevice(
            agencyOwner.fcmToken,
            'Order Delivered!',
            `Order #${order.orderNumber} has been delivered successfully.`,
            { type: 'ORDER_DELIVERED', orderId: order.id, orderNumber: order.orderNumber }
          );
        }

        // Create database notification for agency owner
        const agencyOwnerUser = await User.findOne({ where: { email: agencyOwner.email } });
        if (agencyOwnerUser) {
          await Notification.create({
            userId: agencyOwnerUser.id,
            title: 'Order Delivered!',
            content: `Order #${order.orderNumber} has been delivered successfully.`,
            notificationType: 'ORDER_STATUS',
            data: {
              type: 'ORDER_STATUS',
              orderId: order.id,
              orderNumber: order.orderNumber,
              status: 'delivered',
              customerName: order.customerName,
              totalAmount: order.totalAmount
            },
            orderId: order.id
          });
        }
      }
    } catch (notifError) {
      logger.error('Error sending delivery notification:', notifError.message);
    }

    res.status(200).json({
      success: true,
      message: 'Order delivered successfully',
      data: {
        order: formatOrderResponse(order),
        deliveryProof: req.file ? {
          url: req.file.path,
          publicId: req.file.filename
        } : null,
        deliveryNote: value.deliveryNote || null,
        paymentReceived: value.paymentReceived || false
      }
    });
  } catch (error) {
    next(error);
  }
};

// Cancel order (Admin)
const cancelOrderHandler = async (req, res, next) => {
  try {
    const { id } = req.params;

    // Validate request body
    const { error, value } = cancelOrder.validate(req.body);
    if (error) {
      return next(createError(400, error.details[0].message));
    }

    const order = await Order.findByPk(id);
    if (!order) {
      return next(createError(404, 'Order not found'));
    }

    if (order.status === 'delivered') {
      return next(createError(400, 'Cannot cancel delivered order'));
    }

    // Determine who cancelled the order
    let cancelledBy = 'system';
    let cancelledById = null;
    let cancelledByName = 'System';

    if (req.user) {
      switch (req.user.role) {
        case 'admin':
          cancelledBy = 'admin';
          cancelledById = req.user.id;
          cancelledByName = req.user.name || req.user.email;
          break;
        case 'agency':
          cancelledBy = 'agency';
          cancelledById = req.user.id;
          cancelledByName = req.user.name || req.user.email;
          break;
        case 'customer':
          cancelledBy = 'customer';
          cancelledById = req.user.id;
          cancelledByName = req.user.name || req.user.email;
          break;
      }
    }

    // Update order
    await order.update({
      status: 'cancelled',
      cancelledAt: new Date(),
      cancelledBy: cancelledBy,
      cancelledById: cancelledById,
      cancelledByName: cancelledByName,
      adminNotes: value.reason
    });

    // Restore stock in agency inventory when order is cancelled
    await restoreStockToAgency(order);

    logger.info(`Order cancelled: ${order.orderNumber} by ${cancelledByName} (${cancelledBy}) - Stock restored to agency inventory`);

    // Send email notification
    await sendEmail(order.customerEmail, 'orderCancelled', formatOrderResponse(order), value.reason);

    // Emit socket notification
    const socketService = getSocketService();
    if (socketService) {
      socketService.emitOrderStatusUpdated({
        orderId: order.id,
        orderNumber: order.orderNumber,
        status: 'cancelled',
        customerEmail: order.customerEmail,
        agencyId: order.agencyId,
        assignedAgentId: order.assignedAgentId,
        reason: value.reason
      });
    }

    // Send Firebase notification to customer about cancellation
    try {
      const customer = await User.findOne({ where: { email: order.customerEmail } });
      if (customer) {
        // Send Firebase push notification
        if (customer.fcmToken) {
          await notificationService.sendToDevice(
            customer.fcmToken,
            'Order Cancelled',
            `Your order #${order.orderNumber} has been cancelled. Reason: ${value.reason || 'Not specified'}`,
            { type: 'ORDER_CANCELLED', orderId: order.id, orderNumber: order.orderNumber }
          );
        }

        // Create database notification for customer
        await Notification.create({
          userId: customer.id,
          title: 'Order Cancelled',
          content: `Your order #${order.orderNumber} has been cancelled${value.reason ? `. Reason: ${value.reason}` : ''}.`,
          notificationType: 'ORDER_STATUS',
          data: {
            type: 'ORDER_STATUS',
            orderId: order.id,
            orderNumber: order.orderNumber,
            status: 'cancelled',
            cancelledBy: cancelledBy,
            cancelledByName: cancelledByName,
            reason: value.reason
          },
          orderId: order.id
        });
      }
    } catch (notifError) {
      logger.error('Error sending cancellation notification:', notifError.message);
    }

    res.status(200).json({
      success: true,
      message: 'Order cancelled successfully',
      data: {
        order: formatOrderResponse(order),
        cancellationInfo: {
          cancelledBy: cancelledBy,
          cancelledByName: cancelledByName,
          cancelledAt: new Date(),
          reason: value.reason
        }
      }
    });
  } catch (error) {
    next(error);
  }
};

// Get orders by status (Role-based filtering)
const getOrdersByStatus = async (req, res, next) => {
  try {
    const { status } = req.params;
    const userRole = req.user.role;
    const userEmail = req.user.email;

    if (!['pending', 'confirmed', 'assigned', 'out_for_delivery', 'delivered', 'cancelled'].includes(status)) {
      return next(createError(400, 'Invalid status'));
    }

    // Build where clause based on user role
    const whereClause = { status };

    if (userRole === 'customer') {
      // Customer can only see their own orders
      whereClause.customerEmail = userEmail;
    } else if (userRole === 'agent') {
      // Agent can only see orders assigned to them
      if (!req.user.deliveryAgentId) {
        return next(createError(400, 'Agent profile not properly linked. Please contact admin.'));
      }
      whereClause.assignedAgentId = req.user.deliveryAgentId;
    }
    // Admin can see all orders (no additional filtering)

    const orders = await Order.findAll({
      where: whereClause,
      include: [
        {
          model: DeliveryAgent,
          as: 'DeliveryAgent',
          attributes: ['id', 'name', 'phone', 'vehicleNumber']
        },
        {
          model: require('../models').Agency,
          as: 'Agency',
          attributes: ['id', 'name', 'email', 'phone', 'city', 'status']
        }
      ],
      order: [['createdAt', 'DESC']]
    });

    res.status(200).json({
      success: true,
      message: `${status} orders retrieved successfully`,
      data: {
        orders: orders.map(order => formatOrderResponse(order, true)),
        userRole,
        filteredBy: userRole === 'customer' ? 'customer_email' :
          userRole === 'agent' ? 'assigned_agent_id' : 'all_orders'
      }
    });
  } catch (error) {
    next(error);
  }
};

// Get customer orders summary (Customer only)
const getCustomerOrdersSummary = async (req, res, next) => {
  try {
    const userRole = req.user.role;
    const userEmail = req.user.email;

    if (userRole !== 'customer') {
      return next(createError(403, 'Access denied. This endpoint is for customers only'));
    }

    // Get orders count by status for this customer
    const ordersSummary = await Order.findAll({
      where: { customerEmail: userEmail },
      attributes: [
        'status',
        [sequelize.fn('COUNT', sequelize.col('id')), 'count']
      ],
      group: ['status'],
      raw: true
    });

    // Get total orders and total amount
    const totalOrders = await Order.count({
      where: { customerEmail: userEmail }
    });

    const totalAmount = await Order.sum('totalAmount', {
      where: { customerEmail: userEmail }
    });

    // Format summary
    const summary = {
      totalOrders,
      totalAmount: totalAmount || 0,
      byStatus: {}
    };

    ordersSummary.forEach(item => {
      summary.byStatus[item.status] = parseInt(item.count);
    });

    res.status(200).json({
      success: true,
      message: 'Customer orders summary retrieved successfully',
      data: {
        summary,
        customerEmail: userEmail
      }
    });
  } catch (error) {
    next(error);
  }
};

// Get agent delivery history
const getAgentDeliveryHistory = async (req, res, next) => {
  try {
    const { page = 1, limit = 10, status, startDate, endDate, customerName } = req.query;
    const offset = (page - 1) * limit;
    const userRole = req.user.role;

    // Only agents can access this endpoint
    if (userRole !== 'agent') {
      return next(createError(403, 'Access denied. Only agents can view delivery history.'));
    }

    // Check if agent profile is properly linked
    if (!req.user.deliveryAgentId) {
      return next(createError(400, 'Agent profile not properly linked. Please contact admin.'));
    }

    // Build where clause for agent's delivered orders
    const whereClause = {
      assignedAgentId: req.user.deliveryAgentId,
      status: { [Op.in]: ['delivered', 'cancelled'] } // Only show completed orders
    };

    // Filter by status if provided
    if (status && ['delivered', 'cancelled'].includes(status)) {
      whereClause.status = status;
    }

    // Filter by date range if provided
    if (startDate || endDate) {
      whereClause.deliveredAt = {};
      if (startDate) {
        whereClause.deliveredAt[Op.gte] = new Date(startDate);
      }
      if (endDate) {
        whereClause.deliveredAt[Op.lte] = new Date(endDate);
      }
    }

    // Filter by customer name if provided
    if (customerName) {
      whereClause.customerName = { [Op.iLike]: `%${customerName}%` };
    }

    const orders = await Order.findAndCountAll({
      where: whereClause,
      include: [
        {
          model: DeliveryAgent,
          as: 'DeliveryAgent',
          attributes: ['id', 'name', 'phone', 'vehicleNumber']
        },
        {
          model: require('../models').Agency,
          as: 'Agency',
          attributes: ['id', 'name', 'email', 'phone', 'city', 'status']
        }
      ],
      limit: parseInt(limit),
      offset: parseInt(offset),
      order: [['deliveredAt', 'DESC'], ['cancelledAt', 'DESC'], ['createdAt', 'DESC']]
    });

    const totalPages = Math.ceil(orders.count / limit);

    // Calculate summary statistics
    const deliveredCount = await Order.count({
      where: {
        assignedAgentId: req.user.deliveryAgentId,
        status: 'delivered'
      }
    });

    const cancelledCount = await Order.count({
      where: {
        assignedAgentId: req.user.deliveryAgentId,
        status: 'cancelled'
      }
    });

    const totalEarnings = await Order.sum('totalAmount', {
      where: {
        assignedAgentId: req.user.deliveryAgentId,
        status: 'delivered'
      }
    });

    res.status(200).json({
      success: true,
      message: 'Agent delivery history retrieved successfully',
      data: {
        orders: orders.rows.map(order => formatOrderResponse(order, true)),
        pagination: {
          currentPage: parseInt(page),
          totalPages,
          totalItems: orders.count,
          itemsPerPage: parseInt(limit)
        },
        summary: {
          totalDelivered: deliveredCount,
          totalCancelled: cancelledCount,
          totalEarnings: totalEarnings || 0,
          totalOrders: deliveredCount + cancelledCount
        },
        agent: {
          id: req.user.deliveryAgentId,
          name: orders.rows[0]?.DeliveryAgent?.name || 'Unknown',
          phone: orders.rows[0]?.DeliveryAgent?.phone || 'Unknown',
          vehicleNumber: orders.rows[0]?.DeliveryAgent?.vehicleNumber || 'Unknown'
        }
      }
    });
  } catch (error) {
    next(error);
  }
};

// Get agent delivery statistics
const getAgentDeliveryStats = async (req, res, next) => {
  try {
    const { period = 'month' } = req.query; // day, week, month, year
    const userRole = req.user.role;

    // Only agents can access this endpoint
    if (userRole !== 'agent') {
      return next(createError(403, 'Access denied. Only agents can view delivery statistics.'));
    }

    // Check if agent profile is properly linked
    if (!req.user.deliveryAgentId) {
      return next(createError(400, 'Agent profile not properly linked. Please contact admin.'));
    }

    // Calculate date range based on period
    const now = new Date();
    let startDate;

    switch (period) {
      case 'day':
        startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        break;
      case 'week':
        startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        break;
      case 'month':
        startDate = new Date(now.getFullYear(), now.getMonth(), 1);
        break;
      case 'year':
        startDate = new Date(now.getFullYear(), 0, 1);
        break;
      default:
        startDate = new Date(now.getFullYear(), now.getMonth(), 1);
    }

    // Get statistics for the period
    const deliveredThisPeriod = await Order.count({
      where: {
        assignedAgentId: req.user.deliveryAgentId,
        status: 'delivered',
        deliveredAt: { [Op.gte]: startDate }
      }
    });

    const cancelledThisPeriod = await Order.count({
      where: {
        assignedAgentId: req.user.deliveryAgentId,
        status: 'cancelled',
        cancelledAt: { [Op.gte]: startDate }
      }
    });

    const earningsThisPeriod = await Order.sum('totalAmount', {
      where: {
        assignedAgentId: req.user.deliveryAgentId,
        status: 'delivered',
        deliveredAt: { [Op.gte]: startDate }
      }
    });

    // Get current active orders (assigned + out_for_delivery)
    const assignedOrders = await Order.count({
      where: {
        assignedAgentId: req.user.deliveryAgentId,
        status: 'assigned'
      }
    });

    const outForDeliveryOrders = await Order.count({
      where: {
        assignedAgentId: req.user.deliveryAgentId,
        status: 'out_for_delivery'
      }
    });

    // Get total delivered orders (all time, not just period)
    const totalDeliveredOrders = await Order.count({
      where: {
        assignedAgentId: req.user.deliveryAgentId,
        status: 'delivered'
      }
    });

    // Get all delivered orders for the period with full details
    const deliveredOrders = await Order.findAll({
      where: {
        assignedAgentId: req.user.deliveryAgentId,
        status: 'delivered',
        deliveredAt: { [Op.gte]: startDate }
      },
      include: [
        {
          model: DeliveryAgent,
          as: 'DeliveryAgent',
          attributes: ['id', 'name', 'phone', 'vehicleNumber']
        },
        {
          model: require('../models').Agency,
          as: 'Agency',
          attributes: ['id', 'name', 'email', 'phone', 'city', 'status']
        }
      ],
      order: [['deliveredAt', 'DESC']]
    });

    // Get cancelled orders for the period with full details
    const cancelledOrders = await Order.findAll({
      where: {
        assignedAgentId: req.user.deliveryAgentId,
        status: 'cancelled',
        cancelledAt: { [Op.gte]: startDate }
      },
      include: [
        {
          model: DeliveryAgent,
          as: 'DeliveryAgent',
          attributes: ['id', 'name', 'phone', 'vehicleNumber']
        },
        {
          model: require('../models').Agency,
          as: 'Agency',
          attributes: ['id', 'name', 'email', 'phone', 'city', 'status']
        }
      ],
      order: [['cancelledAt', 'DESC']]
    });

    // Group by date manually with full order details
    const dailyStats = {};
    deliveredOrders.forEach(order => {
      const date = order.deliveredAt.toISOString().split('T')[0];
      if (!dailyStats[date]) {
        dailyStats[date] = {
          count: 0,
          earnings: 0,
          orders: []
        };
      }
      dailyStats[date].count += 1;
      dailyStats[date].earnings += parseFloat(order.totalAmount);
      dailyStats[date].orders.push(formatOrderResponse(order, true));
    });

    // Convert to array format with full details
    const dailyBreakdown = Object.entries(dailyStats).map(([date, stats]) => ({
      date,
      count: stats.count.toString(),
      earnings: stats.earnings.toFixed(2),
      orders: stats.orders
    }));

    res.status(200).json({
      success: true,
      message: 'Agent delivery statistics retrieved successfully',
      data: {
        period,
        periodStart: startDate,
        periodEnd: now,
        stats: {
          // Period-based stats
          deliveredThisPeriod: deliveredThisPeriod,
          cancelledThisPeriod: cancelledThisPeriod,
          earningsThisPeriod: earningsThisPeriod || 0,
          totalOrdersThisPeriod: deliveredThisPeriod + cancelledThisPeriod,

          // Current active orders
          assignedOrders: assignedOrders,
          outForDeliveryOrders: outForDeliveryOrders,
          totalActiveOrders: assignedOrders + outForDeliveryOrders,

          // All-time stats
          totalDeliveredOrders: totalDeliveredOrders
        },
        dailyBreakdown: dailyBreakdown,
        deliveredOrders: deliveredOrders.map(order => formatOrderResponse(order, true)),
        cancelledOrders: cancelledOrders.map(order => formatOrderResponse(order, true))
      }
    });
  } catch (error) {
    next(error);
  }
};

const returnOrderHandler = async (req, res, next) => {
  try {
    const { id } = req.params;

    // Validate request body
    const { error, value } = returnOrder.validate(req.body);
    if (error) {
      return next(createError(400, error.details[0].message));
    }

    const order = await Order.findByPk(id);
    if (!order) {
      return next(createError(404, 'Order not found'));
    }

    // Only delivered orders can be returned
    if (order.status !== 'delivered') {
      return next(createError(400, 'Only delivered orders can be returned'));
    }

    // Check permissions - customer can only return their own orders
    if (req.user.role === 'customer' && order.customerEmail !== req.user.email) {
      return next(createError(403, 'Access denied. You can only return your own orders'));
    }

    // Determine who returned the order
    let returnedBy = 'system';
    let returnedById = null;
    let returnedByName = 'System';

    if (req.user) {
      switch (req.user.role) {
        case 'admin':
          returnedBy = 'admin';
          returnedById = req.user.id;
          returnedByName = req.user.name || req.user.email;
          break;
        case 'agency':
          returnedBy = 'agency';
          returnedById = req.user.id;
          returnedByName = req.user.name || req.user.email;
          break;
        case 'customer':
          returnedBy = 'customer';
          returnedById = req.user.id;
          returnedByName = req.user.name || req.user.email;
          break;
      }
    }

    // Update order
    await order.update({
      status: 'returned',
      returnedAt: new Date(),
      returnedBy: returnedBy,
      returnedById: returnedById,
      returnedByName: returnedByName,
      returnReason: value.reason,
      adminNotes: value.adminNotes || order.adminNotes
    });

    // Restore stock in agency inventory when order is returned
    await restoreStockToAgency(order);

    logger.info(`Order returned: ${order.orderNumber} by ${returnedByName} (${returnedBy}) - Stock restored to agency inventory`);

    // Send email notification
    await sendEmail(order.customerEmail, 'orderReturned', formatOrderResponse(order), value.reason);

    // Emit socket notification
    const socketService = getSocketService();
    if (socketService) {
      socketService.emitOrderStatusUpdated({
        orderId: order.id,
        orderNumber: order.orderNumber,
        status: 'returned',
        customerEmail: order.customerEmail,
        agencyId: order.agencyId,
        assignedAgentId: order.assignedAgentId,
        reason: value.reason
      });
    }

    // Send Firebase notification to customer about return
    try {
      const customer = await User.findOne({ where: { email: order.customerEmail } });
      if (customer) {
        // Send Firebase push notification
        if (customer.fcmToken) {
          await notificationService.sendToDevice(
            customer.fcmToken,
            'Order Returned',
            `Your order #${order.orderNumber} has been returned. Reason: ${value.reason || 'Not specified'}`,
            { type: 'ORDER_RETURNED', orderId: order.id, orderNumber: order.orderNumber }
          );
        }

        // Create database notification for customer
        await Notification.create({
          userId: customer.id,
          title: 'Order Returned',
          content: `Your order #${order.orderNumber} has been returned${value.reason ? `. Reason: ${value.reason}` : ''}.`,
          notificationType: 'ORDER_STATUS',
          data: {
            type: 'ORDER_STATUS',
            orderId: order.id,
            orderNumber: order.orderNumber,
            status: 'returned',
            returnedBy: returnedBy,
            returnedByName: returnedByName,
            reason: value.reason
          },
          orderId: order.id
        });
      }
      
      // Notify agency owner about return
      const agencyOwner = await AgencyOwner.findOne({ where: { agencyId: order.agencyId } });
      if (agencyOwner) {
        // Send Firebase push notification
        if (agencyOwner.fcmToken) {
          await notificationService.sendToDevice(
            agencyOwner.fcmToken,
            'Order Returned',
            `Order #${order.orderNumber} has been returned. Stock restored.`,
            { type: 'ORDER_RETURNED', orderId: order.id, orderNumber: order.orderNumber }
          );
        }

        // Create database notification for agency owner
        const agencyOwnerUser = await User.findOne({ where: { email: agencyOwner.email } });
        if (agencyOwnerUser) {
          await Notification.create({
            userId: agencyOwnerUser.id,
            title: 'Order Returned',
            content: `Order #${order.orderNumber} has been returned. Stock has been restored to inventory.`,
            notificationType: 'ORDER_STATUS',
            data: {
              type: 'ORDER_STATUS',
              orderId: order.id,
              orderNumber: order.orderNumber,
              status: 'returned',
              customerName: order.customerName,
              reason: value.reason
            },
            orderId: order.id
          });
        }
      }
    } catch (notifError) {
      logger.error('Error sending return notification:', notifError.message);
    }

    res.status(200).json({
      success: true,
      message: 'Order returned successfully',
      data: {
        order: formatOrderResponse(order),
        returnInfo: {
          returnedBy: returnedBy,
          returnedByName: returnedByName,
          returnedAt: new Date(),
          reason: value.reason
        }
      }
    });
  } catch (error) {
    next(error);
  }
};

const getOrderById = async (req, res, next) => {
  try {
    const { id } = req.params;

    // Find the order with all related data
    const order = await Order.findByPk(id, {
      include: [
        {
          model: require('../models/Agency'),
          as: 'Agency',
          attributes: ['id', 'name', 'email', 'phone', 'city', 'status']
        },
        {
          model: require('../models/DeliveryAgent'),
          as: 'DeliveryAgent',
          attributes: ['id', 'name', 'phone', 'vehicleNumber']
        }
      ]
    });

    if (!order) {
      return next(createError(404, 'Order not found'));
    }

    // Check permissions based on user role
    const userRole = req.user.role;
    const userId = req.user.id;

    // Admin can see all orders
    if (userRole === 'admin') {
      // No additional filtering needed
    }
    // Agency can only see their own orders
    else if (userRole === 'agency') {
      if (order.agencyId !== userId) {
        return next(createError(403, 'Access denied. You can only view orders for your agency'));
      }
    }
    // Customer can only see their own orders
    else if (userRole === 'customer') {
      if (order.customerEmail !== req.user.email) {
        return next(createError(403, 'Access denied. You can only view your own orders'));
      }
    }
    // Delivery agent can only see orders assigned to them
    else if (userRole === 'delivery_agent') {
      if (order.assignedAgentId !== req.user.deliveryAgentId) {
        return next(createError(403, 'Access denied. You can only view orders assigned to you'));
      }
    }

    res.status(200).json({
      success: true,
      data: {
        order: formatOrderResponse(order, true) // Include agent information
      }
    });

  } catch (error) {
    next(error);
  }
};

// Mark payment received for pickup orders (Admin/Agency Owner)
const markPaymentReceivedHandler = async (req, res, next) => {
  try {
    const { id } = req.params;

    // Validate request body
    const { error, value } = markPaymentReceived.validate(req.body);
    if (error) {
      return next(createError(400, error.details[0].message));
    }

    const order = await Order.findByPk(id);
    if (!order) {
      return next(createError(404, 'Order not found'));
    }

    // Check permissions
    const userRole = req.user.role;

    // Only admin and agency owners can mark payment received
    if (userRole !== 'admin' && userRole !== 'agency_owner') {
      return next(createError(403, 'Access denied. Only admin and agency owners can mark payment received.'));
    }

    // Agency owners can only mark payment for their own agency's orders
    if (userRole === 'agency_owner' && order.agencyId !== req.user.agencyId) {
      return next(createError(403, 'Access denied. You can only mark payment for orders from your own agency.'));
    }

    // Only pickup orders can have payment marked as received
    if (order.deliveryMode !== 'pickup') {
      return next(createError(400, 'Payment can only be marked for pickup orders.'));
    }

    // For pickup orders, we can mark payment and automatically deliver the order
    // Order should not be cancelled or already delivered
    if (order.status === 'cancelled') {
      return next(createError(400, 'Cannot mark payment for cancelled orders.'));
    }

    if (order.status === 'returned') {
      return next(createError(400, 'Cannot mark payment for returned orders.'));
    }

    // Update payment received status and automatically deliver the order
    const updateData = {
      paymentReceived: value.paymentReceived,
      status: 'delivered',  // Automatically mark as delivered when payment is processed
      deliveredAt: new Date()  // Set delivery timestamp
    };

    // If notes are provided, add them to admin notes
    if (value.notes) {
      const currentNotes = order.adminNotes || '';
      const newNotes = currentNotes ? `${currentNotes}\n\nPayment Note: ${value.notes}` : `Payment Note: ${value.notes}`;
      updateData.adminNotes = newNotes;
    }

    // If payment is received, also update payment status
    if (value.paymentReceived === true) {
      updateData.paymentStatus = 'paid';
    }

    await order.update(updateData);

    logger.info(`Payment marked as ${value.paymentReceived ? 'received' : 'not received'} and order delivered: ${order.orderNumber} by ${req.user.name || req.user.email}`);

    // Emit socket notification
    const socketService = getSocketService();
    if (socketService) {
      socketService.emitOrderStatusUpdated({
        orderId: order.id,
        orderNumber: order.orderNumber,
        status: 'delivered',
        customerEmail: order.customerEmail,
        agencyId: order.agencyId,
        paymentReceived: value.paymentReceived,
        deliveredAt: new Date(),
        updatedBy: req.user.name || req.user.email
      });
    }

    // Send Firebase notification to customer about payment and delivery
    try {
      const customer = await User.findOne({ where: { email: order.customerEmail } });
      if (customer) {
        // Send Firebase push notification
        if (customer.fcmToken) {
          await notificationService.sendToDevice(
            customer.fcmToken,
            'Order Delivered!',
            `Your order #${order.orderNumber} has been delivered. Payment ${value.paymentReceived ? 'received' : 'pending'}.`,
            { type: 'ORDER_DELIVERED', orderId: order.id, orderNumber: order.orderNumber, paymentReceived: value.paymentReceived }
          );
        }

        // Create database notification for customer
        await Notification.create({
          userId: customer.id,
          title: 'Order Delivered!',
          content: `Your order #${order.orderNumber} has been delivered. Payment ${value.paymentReceived ? 'received' : 'pending'}.`,
          notificationType: 'ORDER_STATUS',
          data: {
            type: 'ORDER_STATUS',
            orderId: order.id,
            orderNumber: order.orderNumber,
            status: 'delivered',
            paymentReceived: value.paymentReceived,
            paymentStatus: order.paymentStatus
          },
          orderId: order.id
        });
      }
    } catch (notifError) {
      logger.error('Error sending payment received notification:', notifError.message);
    }

    res.status(200).json({
      success: true,
      message: `Payment marked as ${value.paymentReceived ? 'received' : 'not received'} and order delivered successfully`,
      data: {
        order: formatOrderResponse(order),
        paymentInfo: {
          paymentReceived: value.paymentReceived,
          paymentStatus: order.paymentStatus,
          orderStatus: 'delivered',
          deliveredAt: new Date(),
          updatedBy: req.user.name || req.user.email,
          updatedAt: new Date(),
          notes: value.notes || null
        }
      }
    });
  } catch (error) {
    next(error);
  }
};



const orderpesapalPayment = async (req, res) => {
  try {
    // Validate orderId
    if (!req.body.orderId) {
      return res.status(400).json({
        success: false,
        message: "Order ID is required"
      });
    }

    //  Fetch order from database
    const order = await Order.findByPk(req.body.orderId);
    if (!order) {
      return res.status(404).json({
        success: false,
        message: "Order not found"
      });
    }

    //  Fetch user from database using order email
    let user = null;
    if (order.customerEmail) {
      user = await User.findOne({ where: { email: order.customerEmail } });
    }

    //  Generate token
    const pesapalBaseUrl = process.env.PESAPAL_URL || "https://pay.pesapal.com";
    const authRes = await axios.post(
      `${pesapalBaseUrl}/v3/api/Auth/RequestToken`,
      {
        consumer_key: process.env.PESAPAL_CONSUMER_KEY,
        consumer_secret: process.env.PESAPAL_CONSUMER_SECRET
      }
    );

    const token = authRes?.data?.token;

    //  Prepare dynamic values from environment or defaults
    const currency = process.env.PESAPAL_CURRENCY || "KES";
    const callbackUrl = process.env.PESAPAL_CALLBACK_URL || (process.env.BASE_URL ? `${process.env.BASE_URL}/pesapal/callback` : "https://7d1510928719.ngrok-free.app/pesapal/callback");
    const countryCode = process.env.PESAPAL_COUNTRY_CODE || "KE";

    //  Prepare order ID - use order.id or orderNumber
    const pesapalOrderId = order.id || order.orderNumber || Date.now().toString();

    // Get amount from order
    const amount = parseFloat(order.totalAmount);
    if (!amount || amount <= 0) {
      return res.status(400).json({
        success: false,
        message: "Invalid order amount"
      });
    }

    //  Prepare description from order items
    let description = `Payment for Order #${order.orderNumber}`;
    if (order.items && Array.isArray(order.items) && order.items.length > 0) {
      const itemNames = order.items.map(item => item.productName || item.variantLabel).filter(Boolean).join(", ");
      if (itemNames) {
        description = `Payment for ${itemNames} - Order #${order.orderNumber}`;
      }
    }

    //  Prepare billing address from order and user data
    let billingAddress = {
      email_address: order.customerEmail || req.body.email || "customer@mail.com",
      phone_number: order.customerPhone || user?.phone || req.body.phone || "0000000000",
      country_code: countryCode,
      first_name: "",
      middle_name: "",
      last_name: "",
      line_1: "",
      line_2: "",
      city: "",
      state: "",
      postal_code: "",
      zip_code: ""
    };

    // Extract name from order customerName or user name
    if (order.customerName) {
      const nameParts = order.customerName.trim().split(" ");
      billingAddress.first_name = nameParts[0] || "";
      billingAddress.last_name = nameParts.length > 1 ? nameParts.slice(1).join(" ") : "";
    } else if (user?.name) {
      const nameParts = user.name.trim().split(" ");
      billingAddress.first_name = nameParts[0] || "";
      billingAddress.last_name = nameParts.length > 1 ? nameParts.slice(1).join(" ") : "";
    } else {
      billingAddress.first_name = req.body.firstName || "";
      billingAddress.last_name = req.body.lastName || "";
    }

    // Get address from order or user addresses
    if (order.customerAddress) {
      billingAddress.line_1 = order.customerAddress;
    } else if (user?.addresses && Array.isArray(user.addresses) && user.addresses.length > 0) {
      const primaryAddress = user.addresses[0];
      billingAddress.line_1 = primaryAddress.address || "";
      billingAddress.city = primaryAddress.city || "";
      billingAddress.postal_code = primaryAddress.pincode || primaryAddress.postal_code || "";
      billingAddress.state = primaryAddress.state || "";
    } else if (user?.address) {
      billingAddress.line_1 = user.address;
    }

    // Override with request body values if provided (optional overrides)
    if (req.body.city) billingAddress.city = req.body.city;
    if (req.body.pin_code || req.body.postal_code) {
      billingAddress.postal_code = req.body.pin_code || req.body.postal_code;
    }
    if (req.body.state) billingAddress.state = req.body.state;
    if (req.body.line_1 || req.body.address) {
      billingAddress.line_1 = req.body.line_1 || req.body.address;
    }
    if (req.body.line_2) billingAddress.line_2 = req.body.line_2;
    if (req.body.country_code) billingAddress.country_code = req.body.country_code;
    if (req.body.firstName) billingAddress.first_name = req.body.firstName;
    if (req.body.lastName) billingAddress.last_name = req.body.lastName;

    // Prepare order payload
    const orderData = {
      id: pesapalOrderId,
      currency: currency,
      amount: amount,
      description: description,
      callback_url: callbackUrl,
      notification_id: process.env.PESAPAL_NOTIFICATION_ID,
      billing_address: billingAddress
    };


    // Create Pesapal order
    const orderRes = await axios.post(
      `${pesapalBaseUrl}/v3/api/Transactions/SubmitOrderRequest`,
      orderData,
      {
        headers: {
          "Authorization": `Bearer ${token}`,
          "Content-Type": "application/json"
        }
      }
    );

    // Store Pesapal tracking ID in order adminNotes for later reference
    const trackingIdNote = `\n\n[Pesapal Payment Initiated ${new Date().toISOString()}] Pesapal Tracking ID: ${orderRes.data.order_tracking_id}`;
    const existingNotes = order.adminNotes || "";
    await order.update({
      adminNotes: existingNotes + trackingIdNote
    });

    return res.status(200).json({
      success: true,
      message: "Pesapal Order Created Successfully",
      order_tracking_id: orderRes.data.order_tracking_id,
      redirect_url: orderRes.data.redirect_url,
      data: orderRes.data
    });

  } catch (error) {
    return res.status(400).json({
      success: false,
      message: "Pesapal Order Creation Failed",
      error: error.response?.data || error.message
    });
  }
};

// Pesapal Payment Callback Handler - Success/Fail status handle karta hai
const pesapalCallbackHandler = async (req, res) => {
  try {
    const { OrderTrackingId, OrderMerchantReference } = req.query;

    if (!OrderTrackingId) {
      return res.status(400).json({
        success: false,
        message: "OrderTrackingId is required"
      });
    }

    // 1️⃣ Generate token for Pesapal API
    const pesapalBaseUrl = process.env.PESAPAL_URL || "https://pay.pesapal.com";
    const authRes = await axios.post(
      `${pesapalBaseUrl}/v3/api/Auth/RequestToken`,
      {
        consumer_key: process.env.PESAPAL_CONSUMER_KEY,
        consumer_secret: process.env.PESAPAL_CONSUMER_SECRET
      }
    );

    const token = authRes.data.token;

    // 2️⃣ Get payment status from Pesapal API
    const paymentStatusRes = await axios.get(
      `${pesapalBaseUrl}/v3/api/Transactions/GetTransactionStatus?orderTrackingId=${OrderTrackingId}`,
      {
        headers: {
          "Authorization": `Bearer ${token}`,
          "Content-Type": "application/json"
        }
      }
    );

    const paymentData = paymentStatusRes.data;

    // Find order by OrderMerchantReference (order.id or orderNumber) or by tracking ID
    let order = null;
    
    if (OrderMerchantReference) {
      // Try to find by order ID first
      order = await Order.findByPk(OrderMerchantReference);
      
      // If not found, try by orderNumber
      if (!order) {
        order = await Order.findOne({ where: { orderNumber: OrderMerchantReference } });
      }
    }

    // If still not found, try to find by tracking ID in adminNotes
    if (!order) {
      // Search in adminNotes for tracking ID
      const orders = await Order.findAll({
        where: {
          adminNotes: {
            [Op.like]: `%Pesapal Tracking ID: ${OrderTrackingId}%`
          }
        }
      });
      if (orders.length > 0) {
        order = orders[0];
      }
    }

    if (!order) {
      console.error("Order not found for tracking ID:", OrderTrackingId);
      return res.status(404).json({
        success: false,
        message: "Order not found",
        orderTrackingId: OrderTrackingId
      });
    }

    // 4️⃣ Update order payment status based on Pesapal response
    const paymentStatus = paymentData.payment_status_description || paymentData.status || paymentData.payment_status;
    const updateData = {};

    if (paymentStatus === "COMPLETED" || paymentStatus === "COMPLETED") {
      // Payment successful
      updateData.paymentStatus = "paid";
      updateData.paymentReceived = true;
      
      // If order is pending, auto-confirm it
      if (order.status === "pending") {
        updateData.status = "confirmed";
        updateData.confirmedAt = new Date();
      }

      logger.info(`Payment successful for Order #${order.orderNumber} - Tracking ID: ${OrderTrackingId}`);

      // Send email notification
      await sendEmail(order.customerEmail, 'paymentSuccess', formatOrderResponse(order));

      // Emit socket notification
      const socketService = getSocketService();
      if (socketService) {
        socketService.emitOrderStatusUpdated({
          orderId: order.id,
          orderNumber: order.orderNumber,
          status: updateData.status || order.status,
          paymentStatus: "paid",
          customerEmail: order.customerEmail,
          agencyId: order.agencyId
        });
      }

      // Send Firebase notification for payment success
      try {
        const customer = await User.findOne({ where: { email: order.customerEmail } });
        if (customer) {
          // Send Firebase push notification
          if (customer.fcmToken) {
            await notificationService.sendToDevice(
              customer.fcmToken,
              'Payment Successful!',
              `Payment for Order #${order.orderNumber} has been confirmed. Your order is being processed.`,
              { type: 'PAYMENT_SUCCESS', orderId: order.id, orderNumber: order.orderNumber }
            );
          }

          // Create database notification for customer
          await Notification.create({
            userId: customer.id,
            title: 'Payment Successful!',
            content: `Payment for Order #${order.orderNumber} has been confirmed. Your order is being processed.`,
            notificationType: 'PAYMENT',
            data: {
              type: 'PAYMENT_SUCCESS',
              orderId: order.id,
              orderNumber: order.orderNumber,
              paymentStatus: 'paid',
              orderStatus: updateData.status || order.status
            },
            orderId: order.id
          });
        }
      } catch (notifError) {
        logger.error('Error sending payment success notification:', notifError.message);
      }

    } else if (paymentStatus === "FAILED" || paymentStatus === "CANCELLED" || paymentStatus === "REJECTED") {
      // Payment failed
      updateData.paymentStatus = "failed";
      updateData.paymentReceived = false;

      logger.warn(`Payment failed for Order #${order.orderNumber} - Tracking ID: ${OrderTrackingId}, Status: ${paymentStatus}`);

      // Send email notification
      await sendEmail(order.customerEmail, 'paymentFailed', formatOrderResponse(order));

      // Emit socket notification
      const socketService = getSocketService();
      if (socketService) {
        socketService.emitOrderStatusUpdated({
          orderId: order.id,
          orderNumber: order.orderNumber,
          status: order.status,
          paymentStatus: "failed",
          customerEmail: order.customerEmail,
          agencyId: order.agencyId
        });
      }

      // Send Firebase notification for payment failure
      try {
        const customer = await User.findOne({ where: { email: order.customerEmail } });
        if (customer) {
          // Send Firebase push notification
          if (customer.fcmToken) {
            await notificationService.sendToDevice(
              customer.fcmToken,
              'Payment Failed',
              `Payment for Order #${order.orderNumber} failed. Please try again.`,
              { type: 'PAYMENT_FAILED', orderId: order.id, orderNumber: order.orderNumber }
            );
          }

          // Create database notification for customer
          await Notification.create({
            userId: customer.id,
            title: 'Payment Failed',
            content: `Payment for Order #${order.orderNumber} failed. Please try again.`,
            notificationType: 'PAYMENT',
            data: {
              type: 'PAYMENT_FAILED',
              orderId: order.id,
              orderNumber: order.orderNumber,
              paymentStatus: 'failed',
              pesapalStatus: paymentStatus
            },
            orderId: order.id
          });
        }
      } catch (notifError) {
        logger.error('Error sending payment failed notification:', notifError.message);
      }

    } else if (paymentStatus === "PENDING" || paymentStatus === "INPROGRESS") {
      // Payment still pending
      updateData.paymentStatus = "pending";
      updateData.paymentReceived = false;

      logger.info(`Payment pending for Order #${order.orderNumber} - Tracking ID: ${OrderTrackingId}`);
    }

    // Store Pesapal tracking ID and status in adminNotes
    const paymentInfo = {
      pesapalTrackingId: OrderTrackingId,
      pesapalStatus: paymentStatus,
      paymentUpdatedAt: new Date().toISOString()
    };
    
    const existingNotes = order.adminNotes || "";
    const paymentNote = `\n\n[Payment Update ${new Date().toISOString()}] Pesapal Tracking ID: ${OrderTrackingId}, Status: ${paymentStatus}`;
    updateData.adminNotes = existingNotes + paymentNote;

    // Update order
    await order.update(updateData);

    // 5️⃣ Return success response to Pesapal
    return res.status(200).json({
      success: true,
      message: "Payment status updated successfully",
      orderId: order.id,
      orderNumber: order.orderNumber,
      paymentStatus: order.paymentStatus,
      pesapalStatus: paymentStatus
    });

  } catch (error) {
    console.error("Pesapal Callback Error:", error.response?.data || error.message);
    logger.error("Pesapal Callback Error:", error);
    
    // Still return 200 to Pesapal so they don't retry
    return res.status(200).json({
      success: false,
      message: "Error processing callback",
      error: error.message
    });
  }
};

// Get Payment Status - Manually check payment status
const getPesapalPaymentStatus = async (req, res) => {
  try {
    const { orderId } = req.params;

    if (!orderId) {
      return res.status(400).json({
        success: false,
        message: "Order ID is required"
      });
    }

    // Find order
    const order = await Order.findByPk(orderId);
    if (!order) {
      return res.status(404).json({
        success: false,
        message: "Order not found"
      });
    }

    // Check if order has Pesapal tracking ID in adminNotes
    // Extract from adminNotes (format: "Pesapal Tracking ID: xxxxx")
    const adminNotes = order.adminNotes || "";
    const trackingIdMatch = adminNotes.match(/Pesapal Tracking ID:\s*([^\s,]+)/);
    const pesapalTrackingId = trackingIdMatch ? trackingIdMatch[1] : null;
    
    if (!pesapalTrackingId) {
      return res.status(400).json({
        success: false,
        message: "No Pesapal tracking ID found for this order. Payment may not have been initiated via Pesapal."
      });
    }

    // Generate token
    const pesapalBaseUrl = process.env.PESAPAL_URL || "https://pay.pesapal.com";
    const authRes = await axios.post(
      `${pesapalBaseUrl}/v3/api/Auth/RequestToken`,
      {
        consumer_key: process.env.PESAPAL_CONSUMER_KEY,
        consumer_secret: process.env.PESAPAL_CONSUMER_SECRET
      }
    );

    const token = authRes.data.token;

    // Get payment status from Pesapal
    const paymentStatusRes = await axios.get(
      `${pesapalBaseUrl}/v3/api/Transactions/GetTransactionStatus?orderTrackingId=${pesapalTrackingId}`,
      {
        headers: {
          "Authorization": `Bearer ${token}`,
          "Content-Type": "application/json"
        }
      }
    );

    const paymentData = paymentStatusRes.data;

    // Update order status if payment is completed
    if (paymentData.payment_status_description === "COMPLETED" || paymentData.status === "COMPLETED") {
      if (order.paymentStatus !== "paid") {
        await order.update({
          paymentStatus: "paid",
          paymentReceived: true
        });
        if (order.status === "pending") {
          await order.update({
            status: "confirmed",
            confirmedAt: new Date()
          });
        }
      }
    }

    return res.status(200).json({
      success: true,
      message: "Payment status retrieved successfully",
      data: {
        orderId: order.id,
        orderNumber: order.orderNumber,
        paymentStatus: order.paymentStatus,
        pesapalStatus: paymentData.payment_status_description || paymentData.status || paymentData.payment_status,
        pesapalData: paymentData
      }
    });

  } catch (error) {
    console.error("Get Payment Status Error:", error.response?.data || error.message);
    return res.status(400).json({
      success: false,
      message: "Failed to get payment status",
      error: error.response?.data || error.message
    });
  }
};

// Get delivery agents list based on logged-in user
const orderDetailslist = async (req, res, next) => {
  try {
    // Check if user is authenticated
    if (!req.user) {
      return next(createError(401, 'Authentication required'));
    }

    const userRole = req.user.role;
    const userEmail = req.user.email;
    const { page = 1, limit = 50, status } = req.query;
    const offset = (page - 1) * limit;

    // Build where clause based on user role
    const whereClause = {};

    if (status) {
      whereClause.status = status;
    }

    // Role-based filtering
    if (userRole === 'customer') {
      // Customer can only see their own orders
      whereClause.customerEmail = userEmail;
    } else if (userRole === 'agent') {
      // Agent can see orders assigned to them
      if (!req.user.deliveryAgentId) {
        return next(createError(400, 'Agent profile not properly linked. Please contact admin.'));
      }
      whereClause.assignedAgentId = req.user.deliveryAgentId;
      
      // If no specific status is requested, show active orders (assigned + out_for_delivery)
      if (!status) {
        whereClause.status = { [Op.in]: ['assigned', 'out_for_delivery'] };
      }
    } else if (userRole === 'agency_owner') {
      // Agency owner can only see orders for their agency
      if (!req.user.agencyId) {
        return next(createError(400, 'Agency profile not properly linked. Please contact admin.'));
      }
      whereClause.agencyId = req.user.agencyId;
    } else if (userRole !== 'admin') {
      return next(createError(403, 'Access denied. Insufficient permissions'));
    }
    // Admin can see all orders (no additional filtering)

    // Get orders count
    const count = await Order.count({
      where: whereClause,
      distinct: true
    });

    // Get orders
    const orders = await Order.findAll({
      where: whereClause,
      include: [
        {
          model: DeliveryAgent,
          as: 'DeliveryAgent',
          attributes: ['id', 'name', 'phone', 'vehicleNumber', 'status', 'profileImage'],
          required: false
        },
        {
          model: Agency,
          as: 'Agency',
          attributes: ['id', 'name', 'email', 'phone', 'city', 'status'],
          required: false
        }
      ],
      limit: Math.min(parseInt(limit), 100),
      offset: parseInt(offset),
      order: [['createdAt', 'DESC']]
    });

    const totalPages = Math.ceil(count / limit);

    res.status(200).json({
      success: true,
      message: 'Orders retrieved successfully',
      data: {
        orders: orders.map(order => formatOrderResponse(order, true)),
        pagination: {
          currentPage: parseInt(page),
          totalPages,
          totalItems: count,
          itemsPerPage: parseInt(limit)
        },
        userRole
      }
    });

  } catch (error) {
    logger.error(`Error getting orders: ${error.message}`);
    next(error);
  }
};

module.exports = {
  createOrderHandler,
  getAllOrders,
  getOrderById,
  updateOrderStatusHandler,
  assignAgentHandler,
  sendOTPHandler,
  verifyOTPHandler,
  cancelOrderHandler,
  returnOrderHandler,
  markPaymentReceivedHandler,
  getOrdersByStatus,
  getCustomerOrdersSummary,
  getAgentDeliveryHistory,
  getAgentDeliveryStats,
  orderpesapalPayment,
  pesapalCallbackHandler,
  getPesapalPaymentStatus,
  orderDetailslist
};
