const { DeliveryCharge, Agency, User, AgencyOwner } = require('../models');
const { createDeliveryCharge, updateDeliveryCharge } = require('../validations/deliveryChargeValidation');
const { createError } = require('../utils/errorHandler');
const logger = require('../utils/logger');
const axios = require('axios');

// Get agency owner ID from request
const getAgencyOwnerContext = async (userId) => {
  // Check if user is admin
  const user = await User.findByPk(userId);
  if (user && user.role === 'admin') {
    return { isAdmin: true, user };
  }
  
  // Check if user is agency owner
  const agencyOwner = await AgencyOwner.findByPk(userId);
  if (agencyOwner) {
    return { isAdmin: false, isAgencyOwner: true, agencyOwner };
  }
  
  throw createError(403, 'Only admin or agency owner can manage delivery charges');
};

// Create delivery charge for an agency
const create = async (req, res, next) => {
  try {
    const context = await getAgencyOwnerContext(req.user.userId);
    
    const { error, value } = createDeliveryCharge.validate(req.body);
    if (error) return next(createError(400, error.details[0].message));

    // Verify agency exists
    const agency = await Agency.findByPk(value.agencyId);
    if (!agency) {
      return next(createError(404, 'Agency not found'));
    }

    // Check if delivery charge already exists for this agency
    const existingCharge = await DeliveryCharge.findOne({
      where: { agencyId: value.agencyId }
    });

    if (existingCharge) {
      return next(createError(400, 'Delivery charge already exists for this agency. Please update the existing one.'));
    }

    // Create delivery charge
    const deliveryCharge = await DeliveryCharge.create(value);

    logger.info(`Delivery charge created for agency ${value.agencyId}`);

    // Emit socket event for real-time updates
    if (global.socketService) {
      global.socketService.emitDeliveryChargeCreated({
        id: deliveryCharge.id,
        agencyId: deliveryCharge.agencyId,
        chargeType: deliveryCharge.chargeType,
        ratePerKm: deliveryCharge.ratePerKm,
        fixedAmount: deliveryCharge.fixedAmount,
        deliveryRadius: deliveryCharge.deliveryRadius,
        status: deliveryCharge.status,
        action: 'created'
      });
    }

    res.status(201).json({
      success: true,
      message: 'Delivery charge created successfully',
      data: deliveryCharge
    });
  } catch (error) {
    logger.error('Error creating delivery charge:', error);
    next(error);
  }
};

// Get all delivery charges (Admin only)
const getAll = async (req, res, next) => {
  try {
    const context = await getAgencyOwnerContext(req.user.userId);
    
    if (!context.isAdmin) {
      return next(createError(403, 'Only admin can view all delivery charges'));
    }

    const { page = 1, limit = 10, status } = req.query;
    const offset = (page - 1) * limit;

    const where = {};
    if (status) {
      where.status = status;
    }

    const { count, rows } = await DeliveryCharge.findAndCountAll({
      where,
      include: [{
        model: Agency,
        as: 'Agency',
        attributes: ['id', 'name', 'email', 'phone', 'address', 'city']
      }],
      limit: parseInt(limit),
      offset: parseInt(offset),
      order: [['createdAt', 'DESC']]
    });

    res.status(200).json({
      success: true,
      data: rows,
      pagination: {
        total: count,
        page: parseInt(page),
        limit: parseInt(limit),
        totalPages: Math.ceil(count / limit)
      }
    });
  } catch (error) {
    logger.error('Error fetching delivery charges:', error);
    next(error);
  }
};

// Get delivery charge by agency ID
const getByAgencyId = async (req, res, next) => {
  try {
    const { agencyId } = req.params;

    const deliveryCharge = await DeliveryCharge.findOne({
      where: { agencyId },
      include: [{
        model: Agency,
        as: 'Agency',
        attributes: ['id', 'name', 'email', 'phone', 'address', 'city']
      }]
    });

    if (!deliveryCharge) {
      return next(createError(404, 'Delivery charge not found for this agency'));
    }

    res.status(200).json({
      success: true,
      data: deliveryCharge
    });
  } catch (error) {
    logger.error('Error fetching delivery charge:', error);
    next(error);
  }
};

// Get delivery charge by ID
const getById = async (req, res, next) => {
  try {
    const { id } = req.params;

    const deliveryCharge = await DeliveryCharge.findByPk(id, {
      include: [{
        model: Agency,
        as: 'Agency',
        attributes: ['id', 'name', 'email', 'phone', 'address', 'city']
      }]
    });

    if (!deliveryCharge) {
      return next(createError(404, 'Delivery charge not found'));
    }

    res.status(200).json({
      success: true,
      data: deliveryCharge
    });
  } catch (error) {
    logger.error('Error fetching delivery charge:', error);
    next(error);
  }
};

// Update delivery charge
const update = async (req, res, next) => {
  try {
    const context = await getAgencyOwnerContext(req.user.userId);
    const { id } = req.params;

    const { error, value } = updateDeliveryCharge.validate(req.body);
    if (error) return next(createError(400, error.details[0].message));

    const deliveryCharge = await DeliveryCharge.findByPk(id);
    if (!deliveryCharge) {
      return next(createError(404, 'Delivery charge not found'));
    }

    // If chargeType is being changed, clear old fields
    if (value.chargeType && value.chargeType !== deliveryCharge.chargeType) {
      // Clear all charge-related fields first
      value.ratePerKm = null;
      value.fixedAmount = null;
      
      // Then set the new field based on type
      if (value.chargeType === 'per_km' && req.body.ratePerKm) {
        value.ratePerKm = req.body.ratePerKm;
      } else if (value.chargeType === 'fixed' && req.body.fixedAmount) {
        value.fixedAmount = req.body.fixedAmount;
      }
    }

    // Update delivery charge
    await deliveryCharge.update(value);

    logger.info(`Delivery charge ${id} updated`);

    // Emit socket event for real-time updates
    if (global.socketService) {
      global.socketService.emitDeliveryChargeUpdated({
        id: deliveryCharge.id,
        agencyId: deliveryCharge.agencyId,
        chargeType: deliveryCharge.chargeType,
        ratePerKm: deliveryCharge.ratePerKm,
        fixedAmount: deliveryCharge.fixedAmount,
        deliveryRadius: deliveryCharge.deliveryRadius,
        status: deliveryCharge.status,
        action: 'updated'
      });
    }

    res.status(200).json({
      success: true,
      message: 'Delivery charge updated successfully',
      data: deliveryCharge
    });
  } catch (error) {
    logger.error('Error updating delivery charge:', error);
    next(error);
  }
};

// Delete delivery charge
const deleteCharge = async (req, res, next) => {
  try {
    const context = await getAgencyOwnerContext(req.user.userId);
    const { id } = req.params;

    const deliveryCharge = await DeliveryCharge.findByPk(id);
    if (!deliveryCharge) {
      return next(createError(404, 'Delivery charge not found'));
    }

    const chargeData = {
      id: deliveryCharge.id,
      agencyId: deliveryCharge.agencyId,
      chargeType: deliveryCharge.chargeType,
      ratePerKm: deliveryCharge.ratePerKm,
      fixedAmount: deliveryCharge.fixedAmount,
      deliveryRadius: deliveryCharge.deliveryRadius,
    };

    await deliveryCharge.destroy();

    logger.info(`Delivery charge ${id} deleted`);

    // Emit socket event for real-time updates
    if (global.socketService) {
      global.socketService.emitDeliveryChargeDeleted({
        ...chargeData,
        action: 'deleted'
      });
    }

    res.status(200).json({
      success: true,
      message: 'Delivery charge deleted successfully'
    });
  } catch (error) {
    logger.error('Error deleting delivery charge:', error);
    next(error);
  }
};

// Calculate distance between two addresses using Google Maps Distance Matrix API
const calculateDistance = async (origin, destination) => {
  try {
    const apiKey = process.env.GOOGLE_MAPS_API_KEY || 'AIzaSyBXNyT9zcGdvhAUCUEYTm6e_qPw26AOPgI';
    
    const response = await axios.get('https://maps.googleapis.com/maps/api/distancematrix/json', {
      params: {
        origins: origin,
        destinations: destination,
        key: apiKey,
        mode: 'driving',
        units: 'metric'
      }
    });

    if (response.data.status !== 'OK') {
      throw new Error(`Google Maps API error: ${response.data.status}`);
    }

    const result = response.data.rows[0].elements[0];
    
    if (result.status !== 'OK') {
      throw new Error(`Distance calculation error: ${result.status}`);
    }

    // Distance in kilometers
    const distanceInKm = result.distance.value / 1000;
    const durationInMinutes = Math.round(result.duration.value / 60);

    return {
      distanceInKm: parseFloat(distanceInKm.toFixed(2)),
      durationInMinutes,
      distanceText: result.distance.text,
      durationText: result.duration.text
    };
  } catch (error) {
    logger.error('Error calculating distance:', error);
    throw createError(500, 'Failed to calculate distance. Please check the addresses.');
  }
};

// Calculate delivery charge based on customer address and agency address
const calculateDeliveryCharge = async (req, res, next) => {
  try {
    const { customerId, agencyId, addressId } = req.body;

    if (!customerId || !agencyId || !addressId) {
      return next(createError(400, 'Customer ID, Agency ID, and Address ID are required'));
    }

    // Get customer
    const customer = await User.findByPk(customerId);
    if (!customer) {
      return next(createError(404, 'Customer not found'));
    }

    // Get customer address
    if (!customer.addresses || !Array.isArray(customer.addresses)) {
      return next(createError(404, 'Customer has no addresses'));
    }

    const customerAddress = customer.addresses.find(addr => addr.id === addressId);
    if (!customerAddress) {
      return next(createError(404, 'Customer address not found'));
    }

    // Get agency
    const agency = await Agency.findByPk(agencyId);
    if (!agency) {
      return next(createError(404, 'Agency not found'));
    }

    // Get delivery charge for agency
    const deliveryCharge = await DeliveryCharge.findOne({
      where: { 
        agencyId,
        status: 'active'
      }
    });

    // If delivery charge not configured, return 0 with message
    if (!deliveryCharge) {
      return res.status(200).json({
        success: true,
        data: {
          deliveryCharge: 0,
          chargeType: 'not_configured',
          message: 'Delivery charge not configured for this agency. No delivery charge will be applied.',
          customerAddress: {
            id: customerAddress.id,
            address: customerAddress.address,
            city: customerAddress.city,
            pincode: customerAddress.pincode
          },
          agencyAddress: {
            name: agency.name,
            address: agency.address,
            city: agency.city,
            pincode: agency.pincode
          }
        }
      });
    }

    // Format addresses for Google Maps API
    const customerFullAddress = `${customerAddress.address}, ${customerAddress.city}, ${customerAddress.pincode}`;
    const agencyFullAddress = `${agency.address}, ${agency.city}, ${agency.pincode}`;

    // Always calculate distance first to check radius
    const distanceInfo = await calculateDistance(agencyFullAddress, customerFullAddress);
    const distanceInKm = distanceInfo.distanceInKm;
    const deliveryRadius = parseFloat(deliveryCharge.deliveryRadius);

    // Check if customer is within delivery radius
    if (distanceInKm > deliveryRadius) {
      return next(createError(400, `Delivery not available. Customer location is ${distanceInKm} km away, but delivery is only available within ${deliveryRadius} km radius.`));
    }

    let finalCharge = 0;

    if (deliveryCharge.chargeType === 'fixed') {
      // Fixed charge
      finalCharge = Math.floor(parseFloat(deliveryCharge.fixedAmount));
    } else if (deliveryCharge.chargeType === 'per_km') {
      // Per KM charge
      const ratePerKm = parseFloat(deliveryCharge.ratePerKm);
      finalCharge = Math.floor(distanceInKm * ratePerKm);
    }

    res.status(200).json({
      success: true,
      data: {
        deliveryCharge: finalCharge,
        chargeType: deliveryCharge.chargeType,
        deliveryRadius: deliveryRadius,
        ...(deliveryCharge.chargeType === 'per_km' && {
          ratePerKm: parseFloat(deliveryCharge.ratePerKm),
          distance: distanceInfo
        }),
        ...(deliveryCharge.chargeType === 'fixed' && {
          fixedAmount: parseFloat(deliveryCharge.fixedAmount),
          distance: distanceInfo
        }),
        customerAddress: {
          id: customerAddress.id,
          address: customerAddress.address,
          city: customerAddress.city,
          pincode: customerAddress.pincode
        },
        agencyAddress: {
          name: agency.name,
          address: agency.address,
          city: agency.city,
          pincode: agency.pincode
        }
      }
    });
  } catch (error) {
    logger.error('Error calculating delivery charge:', error);
    next(error);
  }
};

module.exports = {
  create,
  getAll,
  getByAgencyId,
  getById,
  update,
  deleteCharge,
  calculateDeliveryCharge
};

