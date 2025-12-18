const { DeliveryAgent, AgencyOwner, User, Notification } = require('../models');
const { createDeliveryAgent, updateDeliveryAgent, updateStatus } = require('../validations/deliveryAgentValidation');
const { createError } = require('../utils/errorHandler');
const logger = require('../utils/logger');
const { Op } = require('sequelize');
const notificationService = require('../services/notificationService');

// Get socket service instance
const getSocketService = () => {
  return global.socketService;
};

// Create a new delivery agent
const createAgent = async (req, res, next) => {
  try {
    // Validate request body
    const { error, value } = createDeliveryAgent.validate(req.body);
    if (error) {
      return next(createError(400, error.details[0].message));
    }

    // Set agencyId based on user role
    if (req.user && req.user.role === 'agency_owner' && req.user.agencyId) {
      // Agency owner can only add agents to their own agency
      value.agencyId = req.user.agencyId;
    } else if (req.user && req.user.role === 'admin') {
      // Admin can add agents to any agency, but agencyId must be provided
      if (!value.agencyId) {
        return next(createError(400, 'Agency ID is required when creating delivery agent as admin'));
      }
      // Validate that the agency exists
      const { Agency } = require('../models');
      const agency = await Agency.findByPk(value.agencyId);
      if (!agency) {
        return next(createError(404, 'Agency not found'));
      }
    } else {
      return next(createError(403, 'Only agency owners and admins can create delivery agents'));
    }

    // Check if email already exists
    const existingEmail = await DeliveryAgent.findOne({ where: { email: value.email } });
    if (existingEmail) {
      return next(createError(400, 'Email already exists'));
    }

    // Check if phone already exists
    const existingPhone = await DeliveryAgent.findOne({ where: { phone: value.phone } });
    if (existingPhone) {
      return next(createError(400, 'Phone number already exists'));
    }

    // Check if vehicle number already exists
    const existingVehicle = await DeliveryAgent.findOne({ where: { vehicleNumber: value.vehicleNumber } });
    if (existingVehicle) {
      return next(createError(400, 'Vehicle number already exists'));
    }

    // Check if driving licence already exists
    const existingLicence = await DeliveryAgent.findOne({ where: { drivingLicence: value.drivingLicence } });
    if (existingLicence) {
      return next(createError(400, 'Driving licence already exists'));
    }

    // Set joinedAt to current date if not provided
    if (!value.joinedAt) {
      value.joinedAt = new Date();
    }

    // Handle optional cloudinary image upload
    if (req.file) {
      value.profileImage = req.file.path; // Cloudinary URL
    }

    // Create delivery agent
    const agent = await DeliveryAgent.create(value);

    logger.info(`Delivery agent created: ${agent.email} for agency: ${value.agencyId}`);

    // Emit socket notification for agent creation
    const socketService = getSocketService();
    if (socketService) {
      socketService.emitAgentCreated({
        id: agent.id,
        name: agent.name,
        email: agent.email,
        phone: agent.phone,
        agencyId: agent.agencyId,
        status: agent.status,
        createdBy: req.user.email || 'admin'
      });
    }

    // Send Firebase notification to agency owner about new agent
    try {
      const agencyOwner = await AgencyOwner.findOne({ where: { agencyId: agent.agencyId } });
      if (agencyOwner) {
        // Send Firebase push notification
        if (agencyOwner.fcmToken) {
          await notificationService.sendToDevice(
            agencyOwner.fcmToken,
            'New Delivery Agent Added! 🚚',
            `${agent.name} has been added as a delivery agent.`,
            { type: 'AGENT_CREATED', agentId: agent.id, agentName: agent.name },
            {
              recipientType: 'agency',
              recipientId: agent.agencyId,
              agencyId: agent.agencyId,
              agentId: agent.id,
              notificationType: 'AGENT_STATUS'
            }
          );
        }

        // Create database notification for agency owner
        const agencyOwnerUser = await User.findOne({ where: { email: agencyOwner.email } });
        if (agencyOwnerUser) {
          await Notification.create({
            userId: agencyOwnerUser.id,
            title: 'New Delivery Agent Added! 🚚',
            content: `${agent.name} has been added as a delivery agent.`,
            notificationType: 'OTHER',
            data: {
              type: 'AGENT_CREATED',
              agentId: agent.id,
              agentName: agent.name,
              agentEmail: agent.email,
              agentPhone: agent.phone,
              agencyId: agent.agencyId
            }
          });
        }
      }
    } catch (notifError) {
      logger.error('Error sending agent creation notification:', notifError.message);
    }

    res.status(201).json({
      success: true,
      message: 'Delivery agent created successfully',
      data: {
        agent,
        ...(req.file && { imageUrl: req.file.path }) // Return cloudinary URL
      }
    });
  } catch (error) {
    next(error);
  }
};

// Get all delivery agents (comprehensive endpoint)
const getAllAgents = async (req, res, next) => {
  try {
    const { page = 1, limit = 10, status, search, id } = req.query;
    const offset = (page - 1) * limit;

    // If ID is provided, get specific agent
    if (id) {
      const whereClause = { id };

      // Filter by agency if user is agency owner
      if (req.user && req.user.role === 'agency_owner' && req.user.agencyId) {
        whereClause.agencyId = req.user.agencyId;
      }

      const agent = await DeliveryAgent.findOne({ where: whereClause });
      if (!agent) {
        return next(createError(404, 'Delivery agent not found'));
      }

      return res.status(200).json({
        success: true,
        message: 'Delivery agent retrieved successfully',
        data: { agent }
      });
    }

    // Build where clause
    const whereClause = {};

    // Filter by agency if user is agency owner
    if (req.user && req.user.role === 'agency_owner' && req.user.agencyId) {
      whereClause.agencyId = req.user.agencyId;
    }

    if (status) {
      whereClause.status = status;
    }
    if (search) {
      whereClause[Op.or] = [
        { name: { [Op.iLike]: `%${search}%` } },
        { email: { [Op.iLike]: `%${search}%` } },
        { phone: { [Op.iLike]: `%${search}%` } },
        { vehicleNumber: { [Op.iLike]: `%${search}%` } }
      ];
    }

    const agents = await DeliveryAgent.findAndCountAll({
      where: whereClause,
      include: [
        {
          model: require('../models').Agency,
          as: 'Agency',
          attributes: ['id', 'name', 'email', 'phone', 'city', 'status'],
          required: false
        }
      ],
      limit: parseInt(limit),
      offset: parseInt(offset),
      order: [['createdAt', 'DESC']]
    });

    const totalPages = Math.ceil(agents.count / limit);

    res.status(200).json({
      success: true,
      message: 'Delivery agents retrieved successfully',
      data: {
        agents: agents.rows,
        pagination: {
          currentPage: parseInt(page),
          totalPages,
          totalItems: agents.count,
          itemsPerPage: parseInt(limit)
        }
      }
    });
  } catch (error) {
    next(error);
  }
};

// Update delivery agent
const updateAgent = async (req, res, next) => {
  try {
    const { id } = req.params;

    // Validate request body
    const { error, value } = updateDeliveryAgent.validate(req.body);
    if (error) {
      return next(createError(400, error.details[0].message));
    }

    // Build where clause for finding agent
    const whereClause = { id };
    if (req.user && req.user.role === 'agency_owner' && req.user.agencyId) {
      whereClause.agencyId = req.user.agencyId;
    }

    const agent = await DeliveryAgent.findOne({ where: whereClause });
    if (!agent) {
      return next(createError(404, 'Delivery agent not found'));
    }

    // Check if email is being updated and if it already exists
    if (value.email && value.email !== agent.email) {
      const existingEmail = await DeliveryAgent.findOne({ where: { email: value.email } });
      if (existingEmail) {
        return next(createError(400, 'Email already exists'));
      }
    }

    // Check if phone is being updated and if it already exists
    if (value.phone && value.phone !== agent.phone) {
      const existingPhone = await DeliveryAgent.findOne({ where: { phone: value.phone } });
      if (existingPhone) {
        return next(createError(400, 'Phone number already exists'));
      }
    }

    // Check if vehicle number is being updated and if it already exists
    if (value.vehicleNumber && value.vehicleNumber !== agent.vehicleNumber) {
      const existingVehicle = await DeliveryAgent.findOne({ where: { vehicleNumber: value.vehicleNumber } });
      if (existingVehicle) {
        return next(createError(400, 'Vehicle number already exists'));
      }
    }


    // Check if driving licence is being updated and if it already exists
    if (value.drivingLicence && value.drivingLicence !== agent.drivingLicence) {
      const existingLicence = await DeliveryAgent.findOne({ where: { drivingLicence: value.drivingLicence } });
      if (existingLicence) {
        return next(createError(400, 'Driving licence already exists'));
      }
    }

    // Handle optional cloudinary image upload
    if (req.file) {
      value.profileImage = req.file.path; // Cloudinary URL
    }

    // Update agent
    await agent.update(value);

    logger.info(`Delivery agent updated: ${agent.email}`);

    // Emit socket notification for agent update
    const socketService = getSocketService();
    if (socketService) {
      socketService.emitAgentUpdated({
        id: agent.id,
        name: agent.name,
        email: agent.email,
        phone: agent.phone,
        agencyId: agent.agencyId,
        status: agent.status,
        updatedBy: req.user.email || 'admin'
      });
    }

    // Send Firebase notification to agent about profile update
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

      // Send Firebase push notification
      if (agent.fcmToken) {
        await notificationService.sendToDevice(
          agent.fcmToken,
          'Profile Updated',
          'Your delivery agent profile has been updated.',
          { type: 'AGENT_PROFILE_UPDATED', agentId: agent.id },
          {
            recipientType: 'agent',
            recipientId: agent.id,
            agencyId: agent.agencyId,
            agentId: agent.id,
            notificationType: 'AGENT_STATUS'
          }
        );
      }

      // Create database notification for agent
      if (agentUser) {
        await Notification.create({
          userId: agentUser.id,
          title: 'Profile Updated',
          content: 'Your delivery agent profile has been updated.',
          notificationType: 'OTHER',
          data: {
            type: 'AGENT_PROFILE_UPDATED',
            agentId: agent.id,
            agencyId: agent.agencyId
          }
        });
      }
    } catch (notifError) {
      logger.error('Error sending agent update notification:', notifError.message);
    }

    res.status(200).json({
      success: true,
      message: 'Delivery agent updated successfully',
      data: {
        agent,
        ...(req.file && { imageUrl: req.file.path }) // Return cloudinary URL
      }
    });
  } catch (error) {
    next(error);
  }
};

// Delete delivery agent
const deleteAgent = async (req, res, next) => {
  try {
    const { id } = req.params;

    // Build where clause for finding agent
    const whereClause = { id };
    if (req.user && req.user.role === 'agency_owner' && req.user.agencyId) {
      whereClause.agencyId = req.user.agencyId;
    }

    const agent = await DeliveryAgent.findOne({ where: whereClause });
    if (!agent) {
      return next(createError(404, 'Delivery agent not found'));
    }

    // Send Firebase notification to agent before deletion
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

      // Send Firebase push notification
      if (agent.fcmToken) {
        await notificationService.sendToDevice(
          agent.fcmToken,
          'Account Removed',
          'Your delivery agent account has been removed from the system.',
          { type: 'AGENT_DELETED', agentId: agent.id },
          {
            recipientType: 'agent',
            recipientId: agent.id,
            agencyId: agent.agencyId,
            agentId: agent.id,
            notificationType: 'AGENT_STATUS'
          }
        );
      }

      // Create database notification for agent
      if (agentUser) {
        await Notification.create({
          userId: agentUser.id,
          title: 'Account Removed',
          content: 'Your delivery agent account has been removed from the system.',
          notificationType: 'OTHER',
          data: {
            type: 'AGENT_DELETED',
            agentId: agent.id,
            agentName: agent.name,
            agencyId: agent.agencyId
          }
        });
      }
    } catch (notifError) {
      logger.error('Error sending agent deletion notification:', notifError.message);
    }

    await agent.destroy();

    logger.info(`Delivery agent deleted: ${agent.email}`);

    res.status(200).json({
      success: true,
      message: 'Delivery agent deleted successfully'
    });
  } catch (error) {
    next(error);
  }
};

// Update agent status
const updateAgentStatus = async (req, res, next) => {
  try {
    const { id } = req.params;

    // Validate request body
    const { error, value } = updateStatus.validate(req.body);
    if (error) {
      return next(createError(400, error.details[0].message));
    }

    // Build where clause for finding agent
    const whereClause = { id };
    if (req.user && req.user.role === 'agency_owner' && req.user.agencyId) {
      whereClause.agencyId = req.user.agencyId;
    }

    const agent = await DeliveryAgent.findOne({ where: whereClause });
    if (!agent) {
      return next(createError(404, 'Delivery agent not found'));
    }

    // Update status
    await agent.update({ status: value.status });

    logger.info(`Delivery agent status updated: ${agent.email} - ${value.status}`);

    // Emit socket notification for agent status change
    const socketService = getSocketService();
    if (socketService) {
      socketService.emitAgentStatusUpdated({
        id: agent.id,
        name: agent.name,
        email: agent.email,
        phone: agent.phone,
        agencyId: agent.agencyId,
        status: agent.status,
        updatedBy: req.user.email || 'admin',
        timestamp: new Date()
      });
    }

    // Send Firebase notification to agent about status change
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

      const statusMessages = {
        'active': 'Your account is now active. You can receive delivery assignments.',
        'inactive': 'Your account has been set to inactive.',
        'busy': 'Your status has been set to busy.',
        'offline': 'Your status has been set to offline.'
      };

      const statusTitles = {
        'active': 'Account Activated! ✅',
        'inactive': 'Account Deactivated',
        'busy': 'Status Updated',
        'offline': 'Status Updated'
      };

      // Send Firebase push notification
      if (agent.fcmToken) {
        await notificationService.sendToDevice(
          agent.fcmToken,
          statusTitles[value.status] || 'Status Updated',
          statusMessages[value.status] || `Your status has been updated to ${value.status}.`,
          { type: 'AGENT_STATUS_CHANGED', agentId: agent.id, status: value.status },
          {
            recipientType: 'agent',
            recipientId: agent.id,
            agencyId: agent.agencyId,
            agentId: agent.id,
            notificationType: 'AGENT_STATUS'
          }
        );
      }

      // Create database notification for agent
      if (agentUser) {
        await Notification.create({
          userId: agentUser.id,
          title: statusTitles[value.status] || 'Status Updated',
          content: statusMessages[value.status] || `Your status has been updated to ${value.status}.`,
          notificationType: 'OTHER',
          data: {
            type: 'AGENT_STATUS_CHANGED',
            agentId: agent.id,
            status: value.status,
            agencyId: agent.agencyId
          }
        });
      }
    } catch (notifError) {
      logger.error('Error sending agent status notification:', notifError.message);
    }

    res.status(200).json({
      success: true,
      message: 'Agent status updated successfully',
      data: { agent }
    });
  } catch (error) {
    next(error);
  }
};

// Get detailed agent information with all delivered orders (Admin and Agency Owner)
const getAgentDetails = async (req, res, next) => {
  try {
    const userRole = req.user.role;
    const { agentId } = req.params;

    // Check if user is admin or agency owner
    if (userRole !== 'admin' && userRole !== 'agency_owner') {
      return next(createError(403, 'Only admin and agency owners can access agent details'));
    }

    // Build where clause for finding agent
    const whereClause = { id: agentId };
    if (userRole === 'agency_owner' && req.user.agencyId) {
      whereClause.agencyId = req.user.agencyId;
    }

    // Find the agent with agency information
    const { Agency } = require('../models');
    const agent = await DeliveryAgent.findOne({
      where: whereClause,
      include: [
        {
          model: Agency,
          as: 'Agency',
          attributes: ['id', 'name', 'email', 'phone', 'address', 'city', 'status']
        }
      ]
    });

    if (!agent) {
      return next(createError(404, 'Delivery agent not found'));
    }

    // Get all orders delivered by this agent
    const { Order } = require('../models');
    const orders = await Order.findAll({
      where: { assignedAgentId: agentId },
      include: [
        {
          model: Agency,
          as: 'Agency',
          attributes: ['id', 'name', 'email', 'phone', 'address', 'city']
        }
      ],
      order: [['deliveredAt', 'DESC'], ['createdAt', 'DESC']]
    });

    // Calculate agent statistics
    const totalOrders = orders.length;
    const deliveredOrders = orders.filter(order => order.status === 'delivered').length;
    const pendingOrders = orders.filter(order => ['pending', 'confirmed', 'assigned', 'out_for_delivery'].includes(order.status)).length;
    const cancelledOrders = orders.filter(order => order.status === 'cancelled').length;
    const totalEarnings = orders
      .filter(order => order.status === 'delivered')
      .reduce((sum, order) => sum + parseFloat(order.totalAmount || 0), 0);

    // Get order status distribution
    const statusDistribution = orders.reduce((acc, order) => {
      acc[order.status] = (acc[order.status] || 0) + 1;
      return acc;
    }, {});

    // Get recent deliveries (last 10)
    const recentDeliveries = orders
      .filter(order => order.status === 'delivered')
      .slice(0, 10)
      .map(order => ({
        id: order.id,
        orderNumber: order.orderNumber,
        customerName: order.customerName,
        customerEmail: order.customerEmail,
        customerPhone: order.customerPhone,
        totalAmount: order.totalAmount,
        deliveredAt: order.deliveredAt,
        deliveryProofImage: order.deliveryProofImage,
        deliveryNote: order.deliveryNote,
        paymentReceived: order.paymentReceived,
        agency: order.Agency ? {
          id: order.Agency.id,
          name: order.Agency.name,
          city: order.Agency.city
        } : null
      }));

    // Get delivery performance by month (last 6 months)
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

    const monthlyPerformance = orders
      .filter(order => order.deliveredAt && new Date(order.deliveredAt) >= sixMonthsAgo)
      .reduce((acc, order) => {
        const month = new Date(order.deliveredAt).toISOString().slice(0, 7); // YYYY-MM
        if (!acc[month]) {
          acc[month] = { deliveries: 0, earnings: 0 };
        }
        acc[month].deliveries += 1;
        acc[month].earnings += parseFloat(order.totalAmount || 0);
        return acc;
      }, {});

    // Get unique customers served
    const uniqueCustomers = [...new Set(orders.map(order => order.customerEmail))];

    logger.info(`Agent details accessed: ${agent.email} by ${userRole} ${req.user.userId}`);

    res.status(200).json({
      success: true,
      message: 'Agent details retrieved successfully',
      data: {
        agent: {
          id: agent.id,
          name: agent.name,
          email: agent.email,
          phone: agent.phone,
          vehicleNumber: agent.vehicleNumber,
          drivingLicence: agent.drivingLicence,
          bankDetails: agent.bankDetails,
          status: agent.status,
          joinedAt: agent.joinedAt,
          profileImage: agent.profileImage,
          agencyId: agent.agencyId,
          createdAt: agent.createdAt,
          updatedAt: agent.updatedAt,
          agency: agent.Agency ? {
            id: agent.Agency.id,
            name: agent.Agency.name,
            email: agent.Agency.email,
            phone: agent.Agency.phone,
            address: agent.Agency.address,
            city: agent.Agency.city,
            status: agent.Agency.status
          } : null
        },
        statistics: {
          totalOrders,
          deliveredOrders,
          pendingOrders,
          cancelledOrders,
          totalEarnings: parseFloat(totalEarnings.toFixed(2)),
          uniqueCustomersServed: uniqueCustomers.length,
          statusDistribution
        },
        recentDeliveries,
        monthlyPerformance: Object.entries(monthlyPerformance).map(([month, data]) => ({
          month,
          deliveries: data.deliveries,
          earnings: parseFloat(data.earnings.toFixed(2))
        })),
        allOrders: orders.map(order => ({
          id: order.id,
          orderNumber: order.orderNumber,
          status: order.status,
          customerName: order.customerName,
          customerEmail: order.customerEmail,
          customerPhone: order.customerPhone,
          customerAddress: order.customerAddress,
          totalAmount: order.totalAmount,
          paymentMethod: order.paymentMethod,
          paymentStatus: order.paymentStatus,
          deliveryMode: order.deliveryMode,
          items: order.items,
          createdAt: order.createdAt,
          confirmedAt: order.confirmedAt,
          assignedAt: order.assignedAt,
          outForDeliveryAt: order.outForDeliveryAt,
          deliveredAt: order.deliveredAt,
          cancelledAt: order.cancelledAt,
          cancelledBy: order.cancelledBy,
          cancelledByName: order.cancelledByName,
          returnedAt: order.returnedAt,
          returnedBy: order.returnedBy,
          returnedByName: order.returnedByName,
          returnReason: order.returnReason,
          adminNotes: order.adminNotes,
          agentNotes: order.agentNotes,
          deliveryProofImage: order.deliveryProofImage,
          deliveryNote: order.deliveryNote,
          paymentReceived: order.paymentReceived,
          agency: order.Agency ? {
            id: order.Agency.id,
            name: order.Agency.name,
            email: order.Agency.email,
            phone: order.Agency.phone,
            address: order.Agency.address,
            city: order.Agency.city
          } : null
        }))
      }
    });
  } catch (error) {
    logger.error(`Error getting agent details: ${error.message}`);
    next(error);
  }
};

module.exports = {
  createAgent,
  getAllAgents,
  getAgentDetails,
  updateAgent,
  deleteAgent,
  updateAgentStatus
};
