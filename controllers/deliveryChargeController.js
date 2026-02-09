const { DeliveryCharge, Agency, User, AgencyOwner } = require('../models');
const { createDeliveryCharge, updateDeliveryCharge } = require('../validations/deliveryChargeValidation');
const { createError } = require('../utils/errorHandler');
const logger = require('../utils/logger');
const axios = require('axios');
const notificationService = require('../services/notificationService');

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

    // Send Firebase notification to agency owner about delivery charge setup
    try {
      const agencyOwner = await AgencyOwner.findOne({ where: { agencyId: value.agencyId } });
      if (agencyOwner && agencyOwner.fcmToken) {
        const chargeText = deliveryCharge.chargeType === 'fixed' 
          ? `Fixed: KSH${deliveryCharge.fixedAmount}` 
          : `KSH${deliveryCharge.ratePerKm}/km`;
        
        await notificationService.sendToDevice(
          agencyOwner.fcmToken,
          'Delivery Charge Configured! 🚚',
          `Delivery charge set: ${chargeText} within ${deliveryCharge.deliveryRadius}km radius.`,
          { type: 'DELIVERY_CHARGE_CREATED', chargeId: deliveryCharge.id, agencyId: deliveryCharge.agencyId },
          {
            recipientType: 'agency',
            recipientId: deliveryCharge.agencyId,
            agencyId: deliveryCharge.agencyId,
            notificationType: 'CUSTOM'
          }
        );
      }
    } catch (notifError) {
      logger.error('Error sending delivery charge notification:', notifError.message);
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

    // Send Firebase notification to agency owner about delivery charge update
    try {
      const agencyOwner = await AgencyOwner.findOne({ where: { agencyId: deliveryCharge.agencyId } });
      if (agencyOwner && agencyOwner.fcmToken) {
        const chargeText = deliveryCharge.chargeType === 'fixed' 
          ? `Fixed: KSH${deliveryCharge.fixedAmount}` 
          : `KSH${deliveryCharge.ratePerKm}/km`;
        
        await notificationService.sendToDevice(
          agencyOwner.fcmToken,
          'Delivery Charge Updated',
          `Delivery charge updated: ${chargeText} within ${deliveryCharge.deliveryRadius}km radius.`,
          { type: 'DELIVERY_CHARGE_UPDATED', chargeId: deliveryCharge.id, agencyId: deliveryCharge.agencyId },
          {
            recipientType: 'agency',
            recipientId: deliveryCharge.agencyId,
            agencyId: deliveryCharge.agencyId,
            notificationType: 'CUSTOM'
          }
        );
      }
    } catch (notifError) {
      logger.error('Error sending delivery charge update notification:', notifError.message);
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

    // Send Firebase notification to agency owner before deletion
    try {
      const agencyOwner = await AgencyOwner.findOne({ where: { agencyId: deliveryCharge.agencyId } });
      if (agencyOwner && agencyOwner.fcmToken) {
        await notificationService.sendToDevice(
          agencyOwner.fcmToken,
          'Delivery Charge Removed',
          'Your delivery charge configuration has been deleted.',
          { type: 'DELIVERY_CHARGE_DELETED', agencyId: deliveryCharge.agencyId },
          {
            recipientType: 'agency',
            recipientId: deliveryCharge.agencyId,
            agencyId: deliveryCharge.agencyId,
            notificationType: 'CUSTOM'
          }
        );
      }
    } catch (notifError) {
      logger.error('Error sending delivery charge deletion notification:', notifError.message);
    }

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
    const apiKey = process.env.GOOGLE_MAPS_API_KEY;
    
    // Check if API key is configured
    if (!apiKey) {
      logger.error('Google Maps API key is not configured. Please set GOOGLE_MAPS_API_KEY in environment variables.');
      throw createError(500, 'Google Maps API key is not configured. Please contact administrator.');
    }

    logger.info(`Calculating distance from ${origin} to ${destination}`);
    
    const response = await axios.get('https://maps.googleapis.com/maps/api/distancematrix/json', {
      params: {
        origins: origin,
        destinations: destination,
        key: apiKey,
        mode: 'driving',
        units: 'metric'
      }
    });

    // Log API response for debugging
    logger.debug('Google Maps API response:', {
      status: response.data.status,
      error_message: response.data.error_message,
      origin_addresses: response.data.origin_addresses,
      destination_addresses: response.data.destination_addresses
    });

    // Handle different API error statuses
    if (response.data.status !== 'OK') {
      const errorMessage = response.data.error_message || 'Unknown error';
      
      if (response.data.status === 'REQUEST_DENIED') {
        logger.error(`Google Maps API REQUEST_DENIED: ${errorMessage}. API Key: ${apiKey.substring(0, 10)}...`);
        throw createError(500, `Google Maps API access denied. Error: ${errorMessage}. Please check: 1) API key is valid, 2) Distance Matrix API is enabled, 3) Billing is enabled, 4) API key restrictions allow this server IP.`);
      } else if (response.data.status === 'INVALID_REQUEST') {
        logger.error(`Google Maps API INVALID_REQUEST: ${errorMessage}`);
        throw createError(400, `Invalid address format. Please check the addresses. Error: ${errorMessage}`);
      } else if (response.data.status === 'OVER_QUERY_LIMIT') {
        logger.error(`Google Maps API OVER_QUERY_LIMIT: ${errorMessage}`);
        throw createError(500, `Google Maps API quota exceeded. Please contact administrator. Error: ${errorMessage}`);
      } else {
        logger.error(`Google Maps API error: ${response.data.status} - ${errorMessage}`);
        throw createError(500, `Google Maps API error: ${response.data.status}. ${errorMessage}`);
      }
    }

    if (!response.data.rows || !response.data.rows[0] || !response.data.rows[0].elements || !response.data.rows[0].elements[0]) {
      throw createError(500, 'Invalid response from Google Maps API. Please try again.');
    }

    const result = response.data.rows[0].elements[0];
    
    if (result.status !== 'OK') {
      if (result.status === 'ZERO_RESULTS') {
        throw createError(400, 'Could not find a route between the addresses. Please check the addresses.');
      } else if (result.status === 'NOT_FOUND') {
        throw createError(400, 'One or both addresses could not be found. Please check the addresses.');
      } else {
        throw createError(400, `Distance calculation failed: ${result.status}. Please check the addresses.`);
      }
    }

    // Distance in kilometers
    const distanceInKm = result.distance.value / 1000;
    const durationInMinutes = Math.round(result.duration.value / 60);

    logger.info(`Distance calculated: ${distanceInKm} km, Duration: ${durationInMinutes} minutes`);

    return {
      distanceInKm: parseFloat(distanceInKm.toFixed(2)),
      durationInMinutes,
      distanceText: result.distance.text,
      durationText: result.duration.text
    };
  } catch (error) {
    // If it's already a createError, re-throw it
    if (error.statusCode) {
      throw error;
    }
    
    // Log the full error for debugging
    logger.error('Error calculating distance:', {
      message: error.message,
      stack: error.stack,
      origin,
      destination
    });
    
    // If axios error, check for network issues
    if (error.response) {
      logger.error('Google Maps API HTTP error:', {
        status: error.response.status,
        data: error.response.data
      });
      throw createError(500, `Failed to connect to Google Maps API. Status: ${error.response.status}`);
    }
    
    throw createError(500, 'Failed to calculate distance. Please check the addresses and try again.');
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

