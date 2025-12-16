const logger = require('../utils/logger');
const jwt = require('jsonwebtoken');
const notificationService = require('./notificationService');

class SocketService {
  constructor() {
    this.io = null;
    this.connectedUsers = new Map(); // Store user connections
    this.rooms = {
      ADMIN: 'admin',
      AGENCIES: 'agencies',
      CUSTOMERS: 'customers',
      AGENTS: 'agents'
    };
  }

  // Initialize Socket.IO instance
  initialize(io) {
    this.io = io;
    this.setupMiddleware();
    this.setupConnectionHandlers();
  }

  // Setup authentication middleware
  setupMiddleware() {
    this.io.use(async (socket, next) => {
      try {
        const token = socket.handshake.auth.token || socket.handshake.headers.authorization?.replace('Bearer ', '');
                
        if (!token) {
          // Allow anonymous connections for public data
          socket.user = { role: 'anonymous', id: 'anonymous' };
          return next();
        }

        // Verify JWT token
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        
        // Fetch user details based on role
        let user = null;
        if (decoded.role === 'admin') {
          const { User } = require('../models');
          user = await User.findByPk(decoded.userId);
        } else if (decoded.role === 'agency_owner') {
          const { AgencyOwner } = require('../models');
          user = await AgencyOwner.findByPk(decoded.userId);
        } else if (decoded.role === 'agent') {
          const { DeliveryAgent } = require('../models');
          user = await DeliveryAgent.findByPk(decoded.deliveryAgentId);
        } else if (decoded.role === 'customer') {
          // For customers, we use email-based identification
          user = { 
            id: decoded.userId, 
            email: decoded.email, 
            role: 'customer' 
          };
        }

        if (!user) {
          return next(new Error('User not found'));
        }

        socket.user = {
          id: user.id,
          email: user.email,
          role: decoded.role,
          agencyId: decoded.agencyId || user.agencyId,
          deliveryAgentId: decoded.deliveryAgentId
        };

        next();
      } catch (error) {
        if (error.name === 'TokenExpiredError') {
          logger.error('JWT token has expired');
        }
        // Allow connection but mark as anonymous
        socket.user = { role: 'anonymous', id: 'anonymous' };
        next();
      }
    });
  }

  // Setup connection handlers
  setupConnectionHandlers() {
    this.io.on('connection', (socket) => {
      this.handleConnection(socket);
    });
  }

  // Handle new socket connection
  handleConnection(socket) {
    const user = socket.user;

    // Store user connection
    if (user.id !== 'anonymous') {
      this.connectedUsers.set(user.id, {
        socketId: socket.id,
        user: user,
        connectedAt: new Date()
      });
    }

    // Join appropriate rooms based on user role
    this.joinRoleBasedRooms(socket, user);

    // Setup event handlers
    this.setupEventHandlers(socket);

    // Handle disconnection
    socket.on('disconnect', () => {
      this.handleDisconnection(socket);
    });

    // Send welcome message
    socket.emit('connected', {
      message: 'Connected to LPG Gas Platform',
      user: {
        role: user.role,
        id: user.id,
        email: user.email
      },
      timestamp: new Date()
    });
    
  }

  // Join rooms based on user role
  joinRoleBasedRooms(socket, user) {
    switch (user.role) {
      case 'admin':
        socket.join(this.rooms.ADMIN);
        socket.join(this.rooms.AGENCIES);
        socket.join(this.rooms.CUSTOMERS);
        socket.join(this.rooms.AGENTS);
        break;
      
      case 'agency_owner':
        socket.join(this.rooms.AGENCIES);
        socket.join(`agency-${user.agencyId}`);
        socket.join(`agency-owner-${user.email}`);
        break;
      
      case 'agent':
        socket.join(this.rooms.AGENTS);
        socket.join(`agent-${user.id}`);
        if (user.agencyId) {
          socket.join(`agency-${user.agencyId}`);
        }
        break;
      
      case 'customer':
        socket.join(this.rooms.CUSTOMERS);
        socket.join(`customer-${user.email}`);
        socket.join('agencies-updates'); // Join agencies updates room for real-time updates
        break;
      
      default:
        break;
    }
  }

  // Setup event handlers for socket
  setupEventHandlers(socket) {
    const user = socket.user;

    // Join specific rooms
    socket.on('join-room', (roomName) => {
      if (this.canJoinRoom(user, roomName)) {
        socket.join(roomName);
        socket.emit('room-joined', { room: roomName });
      } else {
        socket.emit('error', { message: 'Access denied to room' });
      }
    });

    // Leave specific rooms
    socket.on('leave-room', (roomName) => {
      socket.leave(roomName);
      socket.emit('room-left', { room: roomName });
    });

    // Get online users (admin only)
    socket.on('get-online-users', () => {
      if (user.role === 'admin') {
        const onlineUsers = Array.from(this.connectedUsers.values()).map(conn => ({
          id: conn.user.id,
          email: conn.user.email,
          role: conn.user.role,
          connectedAt: conn.connectedAt
        }));
        socket.emit('online-users', onlineUsers);
      }
    });

    // Ping/Pong for connection health
    socket.on('ping', () => {
      socket.emit('pong', { timestamp: new Date() });
    });

    // Request real-time data updates
    socket.on('subscribe-orders', () => {
      if (user.role !== 'anonymous') {
        socket.join('orders-updates');
        socket.emit('subscribed', { type: 'orders' });
      } else {
        logger.warn(`Anonymous user tried to subscribe to orders`);
      }
    });

    socket.on('subscribe-products', () => {
      if (user.role !== 'anonymous') {
        socket.join('products-updates');
        socket.emit('subscribed', { type: 'products' });
      } else {
        logger.warn(`Anonymous user tried to subscribe to products`);
      }
    });

    socket.on('subscribe-agencies', () => {
      if (user.role === 'admin') {
        socket.join('agencies-updates');
        socket.emit('subscribed', { type: 'agencies' });
      } else {
        logger.warn(`Non-admin user ${user.email} tried to subscribe to agencies`);
      }
    });

    socket.on('subscribe-agents', () => {
      if (user.role === 'admin' || user.role === 'agency_owner') {
        socket.join('agents-updates');
        socket.emit('subscribed', { type: 'agents' });
      } else {
        logger.warn(`User ${user.email} tried to subscribe to agents without permission`);
      }
    });

    socket.on('subscribe-inventory', (agencyId) => {
      if (user.role === 'admin' || (user.role === 'agency_owner' && user.agencyId === agencyId)) {
        socket.join(`inventory-${agencyId}`);
        socket.emit('subscribed', { type: 'inventory', agencyId });
      } else {
        logger.warn(`User ${user.email} tried to subscribe to inventory ${agencyId} without permission`);
      }
    });

    // Join specific agency room for real-time product updates
    socket.on('join-agency-room', (data) => {
      const { agencyId } = data;
      if (user.role === 'customer' || user.role === 'admin') {
        socket.join(`agency-${agencyId}`);
        socket.emit('joined-room', { type: 'agency', agencyId });
      } else {
        logger.warn(`User ${user.email} tried to join agency room ${agencyId} without permission`);
      }
    });

    // Leave specific agency room
    socket.on('leave-agency-room', (data) => {
      const { agencyId } = data;
      if (user.role === 'customer' || user.role === 'admin') {
        socket.leave(`agency-${agencyId}`);
        socket.emit('left-room', { type: 'agency', agencyId });
      } else {
        logger.warn(`User ${user.email} tried to leave agency room ${agencyId} without permission`);
      }
    });
  }

  // Check if user can join a specific room
  canJoinRoom(user, roomName) {
    if (user.role === 'admin') return true;
    
    if (roomName.startsWith('agency-') && user.role === 'agency_owner') {
      const agencyId = roomName.split('-')[1];
      return user.agencyId === agencyId;
    }
    
    if (roomName.startsWith('agent-') && user.role === 'agent') {
      const agentId = roomName.split('-')[1];
      return user.id === agentId;
    }
    
    if (roomName.startsWith('customer-') && user.role === 'customer') {
      const email = roomName.split('-')[1];
      return user.email === email;
    }
    
    return false;
  }

  // Handle socket disconnection
  handleDisconnection(socket) {
    const user = socket.user;
    
    if (user.id !== 'anonymous') {
      this.connectedUsers.delete(user.id);
    }
  }

  // ========== NOTIFICATION METHODS ==========

  // Order notifications
  emitOrderCreated(orderData) {
    this.io.to(this.rooms.ADMIN).emit('order:created', {
      type: 'ORDER_CREATED',
      data: orderData,
      timestamp: new Date()
    });

    if (orderData.agencyId) {
      this.io.to(`agency-${orderData.agencyId}`).emit('order:created', {
        type: 'ORDER_CREATED',
        data: orderData,
        timestamp: new Date()
      });
    }

    this.io.to('orders-updates').emit('order:created', {
      type: 'ORDER_CREATED',
      data: orderData,
      timestamp: new Date()
    });
  }

  emitOrderStatusUpdated(orderData) {
    // Emit to admin room
    this.io.to(this.rooms.ADMIN).emit('order:status-updated', {
      type: 'ORDER_STATUS_UPDATED',
      data: orderData,
      timestamp: new Date()
    });

    // Emit to agency
    if (orderData.agencyId) {
      this.io.to(`agency-${orderData.agencyId}`).emit('order:status-updated', {
        type: 'ORDER_STATUS_UPDATED',
        data: orderData,
        timestamp: new Date()
      });
    }

    // Emit to agent
    if (orderData.assignedAgentId) {
      this.io.to(`agent-${orderData.assignedAgentId}`).emit('order:status-updated', {
        type: 'ORDER_STATUS_UPDATED',
        data: orderData,
        timestamp: new Date()
      });
    }

    // Emit to customer
    if (orderData.customerEmail) {
      const customerRoom = `customer-${orderData.customerEmail}`;
      this.io.to(customerRoom).emit('order:status-updated', {
        type: 'ORDER_STATUS_UPDATED',
        data: orderData,
        timestamp: new Date()
      });
    }

    // Emit to all subscribed
    this.io.to('orders-updates').emit('order:status-updated', {
      type: 'ORDER_STATUS_UPDATED',
      data: orderData,
      timestamp: new Date()
    });
  }

  emitOrderAssigned(orderData) {
    this.io.to(this.rooms.ADMIN).emit('order:assigned', {
      type: 'ORDER_ASSIGNED',
      data: orderData,
      timestamp: new Date()
    });

    if (orderData.agencyId) {
      this.io.to(`agency-${orderData.agencyId}`).emit('order:assigned', {
        type: 'ORDER_ASSIGNED',
        data: orderData,
        timestamp: new Date()
      });
    }

    if (orderData.assignedAgentId) {
      this.io.to(`agent-${orderData.assignedAgentId}`).emit('order:assigned', {
        type: 'ORDER_ASSIGNED',
        data: orderData,
        timestamp: new Date()
      });
    }

    if (orderData.customerEmail) {
      this.io.to(`customer-${orderData.customerEmail}`).emit('order:assigned', {
        type: 'ORDER_ASSIGNED',
        data: orderData,
        timestamp: new Date()
      });
    }
  }

  emitOrderDelivered(orderData) {
    this.io.to(this.rooms.ADMIN).emit('order:delivered', {
      type: 'ORDER_DELIVERED',
      data: orderData,
      timestamp: new Date()
    });

    if (orderData.agencyId) {
      this.io.to(`agency-${orderData.agencyId}`).emit('order:delivered', {
        type: 'ORDER_DELIVERED',
        data: orderData,
        timestamp: new Date()
      });
    }

    if (orderData.assignedAgentId) {
      this.io.to(`agent-${orderData.assignedAgentId}`).emit('order:delivered', {
        type: 'ORDER_DELIVERED',
        data: orderData,
        timestamp: new Date()
      });
    }

    if (orderData.customerEmail) {
      this.io.to(`customer-${orderData.customerEmail}`).emit('order:delivered', {
        type: 'ORDER_DELIVERED',
        data: orderData,
        timestamp: new Date()
      });
    }
  }

  // Product notifications
  emitProductCreated(productData) {
    this.io.to(this.rooms.ADMIN).emit('product:created', {
      type: 'PRODUCT_CREATED',
      data: productData,
      timestamp: new Date()
    });

    this.io.to(this.rooms.AGENCIES).emit('product:created', {
      type: 'PRODUCT_CREATED',
      data: productData,
      timestamp: new Date()
    });

    this.io.to('products-updates').emit('product:created', {
      type: 'PRODUCT_CREATED',
      data: productData,
      timestamp: new Date()
    });
  }

  emitProductUpdated(productData) {
    this.io.to(this.rooms.ADMIN).emit('product:updated', {
      type: 'PRODUCT_UPDATED',
      data: productData,
      timestamp: new Date()
    });

    this.io.to(this.rooms.AGENCIES).emit('product:updated', {
      type: 'PRODUCT_UPDATED',
      data: productData,
      timestamp: new Date()
    });

    this.io.to('products-updates').emit('product:updated', {
      type: 'PRODUCT_UPDATED',
      data: productData,
      timestamp: new Date()
    });
  }

  emitInventoryUpdated(inventoryData) {
    this.io.to(this.rooms.ADMIN).emit('inventory:updated', {
      type: 'INVENTORY_UPDATED',
      data: inventoryData,
      timestamp: new Date()
    });

    if (inventoryData.agencyId) {
      this.io.to(`agency-${inventoryData.agencyId}`).emit('inventory:updated', {
        type: 'INVENTORY_UPDATED',
        data: inventoryData,
        timestamp: new Date()
      });

      this.io.to(`inventory-${inventoryData.agencyId}`).emit('inventory:updated', {
        type: 'INVENTORY_UPDATED',
        data: inventoryData,
        timestamp: new Date()
      });

      // Emit to customers subscribed to specific agency for real-time product availability
      const productAvailabilityData = {
        type: 'PRODUCT_AVAILABILITY_CHANGED',
        data: {
          productId: inventoryData.productId,
          productName: inventoryData.productName,
          agencyId: inventoryData.agencyId,
          isActive: inventoryData.isActive !== false, // Default to true if not specified
          stock: inventoryData.stock,
          action: inventoryData.action || 'updated'
        },
        timestamp: new Date()
      };
      
      
      // Emit to specific agency room only
      this.io.to(`agency-${inventoryData.agencyId}`).emit('product:availability-changed', productAvailabilityData);
    }

  }

  emitLowStockAlert(inventoryData) {
    this.io.to(this.rooms.ADMIN).emit('inventory:low-stock', {
      type: 'LOW_STOCK_ALERT',
      data: inventoryData,
      timestamp: new Date()
    });

    if (inventoryData.agencyId) {
      this.io.to(`agency-${inventoryData.agencyId}`).emit('inventory:low-stock', {
        type: 'LOW_STOCK_ALERT',
        data: inventoryData,
        timestamp: new Date()
      });
    }

  }

  // Agency notifications
  emitAgencyCreated(agencyData) {
    this.io.to(this.rooms.ADMIN).emit('agency:created', {
      type: 'AGENCY_CREATED',
      data: agencyData,
      timestamp: new Date()
    });

    this.io.to('agencies-updates').emit('agency:created', {
      type: 'AGENCY_CREATED',
      data: agencyData,
      timestamp: new Date()
    });

  }

  emitAgencyUpdated(agencyData) {
    this.io.to(this.rooms.ADMIN).emit('agency:updated', {
      type: 'AGENCY_UPDATED',
      data: agencyData,
      timestamp: new Date()
    });

    this.io.to(`agency-${agencyData.id}`).emit('agency:updated', {
      type: 'AGENCY_UPDATED',
      data: agencyData,
      timestamp: new Date()
    });

    this.io.to('agencies-updates').emit('agency:updated', {
      type: 'AGENCY_UPDATED',
      data: agencyData,
      timestamp: new Date()
    });
  }

  // Delivery Agent notifications
  emitAgentCreated(agentData) {
    this.io.to(this.rooms.ADMIN).emit('agent:created', {
      type: 'AGENT_CREATED',
      data: agentData,
      timestamp: new Date()
    });

    if (agentData.agencyId) {
      this.io.to(`agency-${agentData.agencyId}`).emit('agent:created', {
        type: 'AGENT_CREATED',
        data: agentData,
        timestamp: new Date()
      });
    }

  }

  emitAgentUpdated(agentData) {
    this.io.to(this.rooms.ADMIN).emit('agent:updated', {
      type: 'AGENT_UPDATED',
      data: agentData,
      timestamp: new Date()
    });

    if (agentData.agencyId) {
      this.io.to(`agency-${agentData.agencyId}`).emit('agent:updated', {
        type: 'AGENT_UPDATED',
        data: agentData,
        timestamp: new Date()
      });
    }

    this.io.to(`agent-${agentData.id}`).emit('agent:updated', {
      type: 'AGENT_UPDATED',
      data: agentData,
      timestamp: new Date()
    });

  }

  emitAgentStatusUpdated(agentData) {
    
    // Emit to admin room
    this.io.to(this.rooms.ADMIN).emit('agent:status-updated', {
      type: 'AGENT_STATUS_UPDATED',
      data: agentData,
      timestamp: new Date()
    });

    // Emit to agency owner room
    if (agentData.agencyId) {
      this.io.to(`agency-${agentData.agencyId}`).emit('agent:status-updated', {
        type: 'AGENT_STATUS_UPDATED',
        data: agentData,
        timestamp: new Date()
      });
    }

    // Emit to specific agent room
    this.io.to(`agent-${agentData.id}`).emit('agent:status-updated', {
      type: 'AGENT_STATUS_UPDATED',
      data: agentData,
      timestamp: new Date()
    });

    // Emit to agents-updates room for all subscribed users
    this.io.to('agents-updates').emit('agent:status-updated', {
      type: 'AGENT_STATUS_UPDATED',
      data: agentData,
      timestamp: new Date()
    });

  }

  // Generic notification method
  emitNotification(type, data, rooms = []) {
    const notification = {
      type,
      data,
      timestamp: new Date()
    };

    if (rooms.length === 0) {
      // Broadcast to all connected clients
      this.io.emit('notification', notification);
    } else {
      // Send to specific rooms
      rooms.forEach(room => {
        this.io.to(room).emit('notification', notification);
      });
    }

  }

  // Broadcast system message
  broadcastSystemMessage(message, type = 'info') {
    this.io.emit('system:message', {
      type: 'SYSTEM_MESSAGE',
      message,
      messageType: type,
      timestamp: new Date()
    });

  }

  // Terms & Conditions notifications
  emitTermsCreated(termsData) {
    this.io.to(this.rooms.ADMIN).emit('terms:created', {
      type: 'TERMS_CREATED',
      data: termsData,
      timestamp: new Date()
    });

    // Notify all users about new terms
    this.io.emit('terms:created', {
      type: 'TERMS_CREATED',
      data: termsData,
      timestamp: new Date()
    });

  }

  emitTermsUpdated(termsData) {
    this.io.to(this.rooms.ADMIN).emit('terms:updated', {
      type: 'TERMS_UPDATED',
      data: termsData,
      timestamp: new Date()
    });

    // Notify all users about updated terms
    this.io.emit('terms:updated', {
      type: 'TERMS_UPDATED',
      data: termsData,
      timestamp: new Date()
    });

  }

  // Privacy Policy notifications
  emitPrivacyPolicyCreated(policyData) {
    this.io.to(this.rooms.ADMIN).emit('privacy:created', {
      type: 'PRIVACY_POLICY_CREATED',
      data: policyData,
      timestamp: new Date()
    });

    // Notify all users about new privacy policy
    this.io.emit('privacy:created', {
      type: 'PRIVACY_POLICY_CREATED',
      data: policyData,
      timestamp: new Date()
    });

  }

  emitPrivacyPolicyUpdated(policyData) {
    this.io.to(this.rooms.ADMIN).emit('privacy:updated', {
      type: 'PRIVACY_POLICY_UPDATED',
      data: policyData,
      timestamp: new Date()
    });

    // Notify all users about updated privacy policy
    this.io.emit('privacy:updated', {
      type: 'PRIVACY_POLICY_UPDATED',
      data: policyData,
      timestamp: new Date()
    });

  }

  // Tax Management notifications
  emitTaxUpdated(taxData) {
    this.io.to(this.rooms.ADMIN).emit('tax:updated', {
      type: 'TAX_UPDATED',
      data: taxData,
      timestamp: new Date()
    });

    // Notify all agencies about tax changes
    this.io.to(this.rooms.AGENCIES).emit('tax:updated', {
      type: 'TAX_UPDATED',
      data: taxData,
      timestamp: new Date()
    });

    // Notify all customers about tax changes
    this.io.to(this.rooms.CUSTOMERS).emit('tax:updated', {
      type: 'TAX_UPDATED',
      data: taxData,
      timestamp: new Date()
    });

  }

  emitTaxDeleted(taxData) {
    this.io.to(this.rooms.ADMIN).emit('tax:deleted', {
      type: 'TAX_DELETED',
      data: taxData,
      timestamp: new Date()
    });

    // Notify all agencies about tax deletion
    this.io.to(this.rooms.AGENCIES).emit('tax:deleted', {
      type: 'TAX_DELETED',
      data: taxData,
      timestamp: new Date()
    });

    // Notify all customers about tax deletion
    this.io.to(this.rooms.CUSTOMERS).emit('tax:deleted', {
      type: 'TAX_DELETED',
      data: taxData,
      timestamp: new Date()
    });

  }

  // Platform Charge notifications
  emitPlatformChargeUpdated(chargeData) {
    this.io.to(this.rooms.ADMIN).emit('platform-charge:updated', {
      type: 'PLATFORM_CHARGE_UPDATED',
      data: chargeData,
      timestamp: new Date()
    });

    // Notify all agencies
    this.io.to(this.rooms.AGENCIES).emit('platform-charge:updated', {
      type: 'PLATFORM_CHARGE_UPDATED',
      data: chargeData,
      timestamp: new Date()
    });

    // Notify all customers
    this.io.to(this.rooms.CUSTOMERS).emit('platform-charge:updated', {
      type: 'PLATFORM_CHARGE_UPDATED',
      data: chargeData,
      timestamp: new Date()
    });

  }

  emitPlatformChargeDeleted(chargeData) {
    this.io.to(this.rooms.ADMIN).emit('platform-charge:deleted', {
      type: 'PLATFORM_CHARGE_DELETED',
      data: chargeData,
      timestamp: new Date()
    });

    // Notify all agencies
    this.io.to(this.rooms.AGENCIES).emit('platform-charge:deleted', {
      type: 'PLATFORM_CHARGE_DELETED',
      data: chargeData,
      timestamp: new Date()
    });

    // Notify all customers
    this.io.to(this.rooms.CUSTOMERS).emit('platform-charge:deleted', {
      type: 'PLATFORM_CHARGE_DELETED',
      data: chargeData,
      timestamp: new Date()
    });

  }

  // Delivery Charge notifications
  emitDeliveryChargeCreated(deliveryChargeData) {
    this.io.to(this.rooms.ADMIN).emit('delivery-charge:created', {
      type: 'DELIVERY_CHARGE_CREATED',
      data: deliveryChargeData,
      timestamp: new Date()
    });

    // Notify specific agency
    if (deliveryChargeData.agencyId) {
      this.io.to(`agency-${deliveryChargeData.agencyId}`).emit('delivery-charge:created', {
        type: 'DELIVERY_CHARGE_CREATED',
        data: deliveryChargeData,
        timestamp: new Date()
      });
    }

    // Notify all customers subscribed to this agency
    this.io.to('agencies-updates').emit('delivery-charge:created', {
      type: 'DELIVERY_CHARGE_CREATED',
      data: deliveryChargeData,
      timestamp: new Date()
    });

  }

  emitDeliveryChargeUpdated(deliveryChargeData) {
    this.io.to(this.rooms.ADMIN).emit('delivery-charge:updated', {
      type: 'DELIVERY_CHARGE_UPDATED',
      data: deliveryChargeData,
      timestamp: new Date()
    });

    // Notify specific agency
    if (deliveryChargeData.agencyId) {
      this.io.to(`agency-${deliveryChargeData.agencyId}`).emit('delivery-charge:updated', {
        type: 'DELIVERY_CHARGE_UPDATED',
        data: deliveryChargeData,
        timestamp: new Date()
      });
    }

    // Notify all customers
    this.io.to('agencies-updates').emit('delivery-charge:updated', {
      type: 'DELIVERY_CHARGE_UPDATED',
      data: deliveryChargeData,
      timestamp: new Date()
    });
  }

  emitDeliveryChargeDeleted(deliveryChargeData) {
    this.io.to(this.rooms.ADMIN).emit('delivery-charge:deleted', {
      type: 'DELIVERY_CHARGE_DELETED',
      data: deliveryChargeData,
      timestamp: new Date()
    });

    // Notify specific agency
    if (deliveryChargeData.agencyId) {
      this.io.to(`agency-${deliveryChargeData.agencyId}`).emit('delivery-charge:deleted', {
        type: 'DELIVERY_CHARGE_DELETED',
        data: deliveryChargeData,
        timestamp: new Date()
      });
    }

    // Notify all customers
    this.io.to('agencies-updates').emit('delivery-charge:deleted', {
      type: 'DELIVERY_CHARGE_DELETED',
      data: deliveryChargeData,
      timestamp: new Date()
    });

  }

  // Coupon notifications
  emitCouponCreated(couponData) {
    this.io.to(this.rooms.ADMIN).emit('coupon:created', {
      type: 'COUPON_CREATED',
      data: couponData,
      timestamp: new Date()
    });

    // Notify specific agency
    if (couponData.agencyId) {
      this.io.to(`agency-${couponData.agencyId}`).emit('coupon:created', {
        type: 'COUPON_CREATED',
        data: couponData,
        timestamp: new Date()
      });
    }

    // Notify customers about new coupon availability
    this.io.to('agencies-updates').emit('coupon:created', {
      type: 'COUPON_CREATED',
      data: couponData,
      timestamp: new Date()
    });

  }

  emitCouponUpdated(couponData) {
    this.io.to(this.rooms.ADMIN).emit('coupon:updated', {
      type: 'COUPON_UPDATED',
      data: couponData,
      timestamp: new Date()
    });

    // Notify specific agency
    if (couponData.agencyId) {
      this.io.to(`agency-${couponData.agencyId}`).emit('coupon:updated', {
        type: 'COUPON_UPDATED',
        data: couponData,
        timestamp: new Date()
      });
    }

    // Notify customers
    this.io.to('agencies-updates').emit('coupon:updated', {
      type: 'COUPON_UPDATED',
      data: couponData,
      timestamp: new Date()
    });
  }

  emitCouponStatusChanged(couponData) {
    this.io.to(this.rooms.ADMIN).emit('coupon:status-changed', {
      type: 'COUPON_STATUS_CHANGED',
      data: couponData,
      timestamp: new Date()
    });

    // Notify specific agency
    if (couponData.agencyId) {
      this.io.to(`agency-${couponData.agencyId}`).emit('coupon:status-changed', {
        type: 'COUPON_STATUS_CHANGED',
        data: couponData,
        timestamp: new Date()
      });
    }

    // Notify customers
    this.io.to('agencies-updates').emit('coupon:status-changed', {
      type: 'COUPON_STATUS_CHANGED',
      data: couponData,
      timestamp: new Date()
    });
  }

  emitCouponDeleted(couponData) {
    this.io.to(this.rooms.ADMIN).emit('coupon:deleted', {
      type: 'COUPON_DELETED',
      data: couponData,
      timestamp: new Date()
    });

    // Notify specific agency
    if (couponData.agencyId) {
      this.io.to(`agency-${couponData.agencyId}`).emit('coupon:deleted', {
        type: 'COUPON_DELETED',
        data: couponData,
        timestamp: new Date()
      });
    }

    // Notify customers
    this.io.to('agencies-updates').emit('coupon:deleted', {
      type: 'COUPON_DELETED',
      data: couponData,
      timestamp: new Date()
    });
  }

  // Send message to specific user by email
  sendToUserByEmail(email, eventName, data, userType = 'customer') {
    // Determine the room based on user type
    const userRoom = userType === 'agency_owner' ? `agency-owner-${email}` : `customer-${email}`;
    
    // Check if anyone is in this room
    const sockets = this.io.sockets.adapter.rooms.get(userRoom);
    if (!sockets || sockets.size === 0) {
      logger.warn(`No clients in room ${userRoom} - Event will NOT be received! User might be offline`);
    }
    
    this.io.to(userRoom).emit(eventName, {
      type: eventName.toUpperCase().replace(':', '_'),
      data,
      timestamp: new Date()
    });
  }

  // Get connected users count
  getConnectedUsersCount() {
    return this.connectedUsers.size;
  }

  // Get connected users by role
  getConnectedUsersByRole(role) {
    return Array.from(this.connectedUsers.values())
      .filter(conn => conn.user.role === role)
      .map(conn => conn.user);
  }

  // Send message to specific user
  sendToUser(userId, event, data) {
    const userConnection = this.connectedUsers.get(userId);
    if (userConnection) {
      this.io.to(userConnection.socketId).emit(event, data);
      return true;
    }
    return false;
  }

  // ========== PUSH NOTIFICATION METHODS ==========

  /**
   * Send push notification for order status update to customer
   * @param {string} fcmToken - Customer's FCM token
   * @param {object} orderData - Order data
   */
  async sendOrderPushToCustomer(fcmToken, orderData) {
    if (!fcmToken) return;
    try {
      await notificationService.sendOrderStatusNotification(fcmToken, orderData);
    } catch (error) {
      logger.error('Failed to send order push to customer:', error.message);
    }
  }

  /**
   * Send push notification for new order to agency
   * @param {string} fcmToken - Agency owner's FCM token
   * @param {object} orderData - Order data
   */
  async sendNewOrderPushToAgency(fcmToken, orderData) {
    if (!fcmToken) return;
    try {
      await notificationService.sendNewOrderToAgency(fcmToken, orderData);
    } catch (error) {
      logger.error('Failed to send new order push to agency:', error.message);
    }
  }

  /**
   * Send push notification for order assignment to delivery agent
   * @param {string} fcmToken - Agent's FCM token
   * @param {object} orderData - Order data
   */
  async sendOrderAssignedPushToAgent(fcmToken, orderData) {
    if (!fcmToken) return;
    try {
      await notificationService.sendOrderAssignedToAgent(fcmToken, orderData);
    } catch (error) {
      logger.error('Failed to send order assigned push to agent:', error.message);
    }
  }

  /**
   * Send push notification for low stock alert
   * @param {string} fcmToken - Agency owner's FCM token
   * @param {object} productData - Product data
   */
  async sendLowStockPush(fcmToken, productData) {
    if (!fcmToken) return;
    try {
      await notificationService.sendLowStockAlert(fcmToken, productData);
    } catch (error) {
      logger.error('Failed to send low stock push:', error.message);
    }
  }

  /**
   * Send promotional push notification to multiple customers
   * @param {string[]} fcmTokens - Array of FCM tokens
   * @param {object} promoData - Promotion data
   */
  async sendPromotionalPush(fcmTokens, promoData) {
    if (!fcmTokens || fcmTokens.length === 0) return;
    try {
      await notificationService.sendPromotionalNotification(fcmTokens, promoData);
    } catch (error) {
      logger.error('Failed to send promotional push:', error.message);
    }
  }

  /**
   * Send custom push notification
   * @param {string} fcmToken - FCM token
   * @param {string} title - Notification title
   * @param {string} body - Notification body
   * @param {object} data - Additional data
   */
  async sendCustomPush(fcmToken, title, body, data = {}) {
    if (!fcmToken) return;
    try {
      await notificationService.sendToDevice(fcmToken, title, body, data);
    } catch (error) {
      logger.error('Failed to send custom push:', error.message);
    }
  }

  /**
   * Send push notification to multiple devices
   * @param {string[]} fcmTokens - Array of FCM tokens
   * @param {string} title - Notification title
   * @param {string} body - Notification body
   * @param {object} data - Additional data
   */
  async sendMultiplePush(fcmTokens, title, body, data = {}) {
    if (!fcmTokens || fcmTokens.length === 0) return;
    try {
      await notificationService.sendToMultipleDevices(fcmTokens, title, body, data);
    } catch (error) {
      logger.error('Failed to send multiple push:', error.message);
    }
  }
}

// Export singleton instance
module.exports = new SocketService();
