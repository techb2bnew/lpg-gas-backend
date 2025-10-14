const logger = require('../utils/logger');
const jwt = require('jsonwebtoken');

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
    logger.info('Socket.IO service initialized');
  }

  // Setup authentication middleware
  setupMiddleware() {
    this.io.use(async (socket, next) => {
      try {
        const token = socket.handshake.auth.token || socket.handshake.headers.authorization?.replace('Bearer ', '');
        
        logger.info(`Socket authentication attempt - Token present: ${!!token}`);
        
        if (!token) {
          // Allow anonymous connections for public data
          logger.info('No token provided - connecting as anonymous');
          socket.user = { role: 'anonymous', id: 'anonymous' };
          return next();
        }

        // Verify JWT token
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        logger.info(`Token decoded successfully - Role: ${decoded.role}, UserId: ${decoded.userId}`);
        
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
          logger.warn(`User not found in database - UserId: ${decoded.userId}, Role: ${decoded.role}`);
          return next(new Error('User not found'));
        }

        socket.user = {
          id: user.id,
          email: user.email,
          role: decoded.role,
          agencyId: decoded.agencyId || user.agencyId,
          deliveryAgentId: decoded.deliveryAgentId
        };

        logger.info(`Socket user authenticated - Email: ${user.email}, Role: ${decoded.role}`);
        next();
      } catch (error) {
        logger.error('Socket authentication error:', error.message);
        if (error.name === 'JsonWebTokenError') {
          logger.error('Invalid JWT token provided');
        } else if (error.name === 'TokenExpiredError') {
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
    logger.info(`🔌 Socket connected: ${socket.id} - User: ${user.email || 'anonymous'} (${user.role})`);

    // Store user connection
    if (user.id !== 'anonymous') {
      this.connectedUsers.set(user.id, {
        socketId: socket.id,
        user: user,
        connectedAt: new Date()
      });
      logger.info(`👤 User registered in connected users map: ${user.email}`);
    } else {
      logger.info(`👻 Anonymous connection: ${socket.id}`);
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
    
    logger.info(`✅ Connection setup complete for ${user.email || 'anonymous'} - Role: ${user.role}`);
  }

  // Join rooms based on user role
  joinRoleBasedRooms(socket, user) {
    switch (user.role) {
      case 'admin':
        socket.join(this.rooms.ADMIN);
        socket.join(this.rooms.AGENCIES);
        socket.join(this.rooms.CUSTOMERS);
        socket.join(this.rooms.AGENTS);
        logger.info(`Admin joined all rooms: ${socket.id}`);
        break;
      
      case 'agency_owner':
        socket.join(this.rooms.AGENCIES);
        socket.join(`agency-${user.agencyId}`);
        socket.join(`agency-owner-${user.email}`);
        logger.info(`Agency owner joined rooms: ${socket.id} - Agency: ${user.agencyId}, Email: ${user.email}`);
        break;
      
      case 'agent':
        socket.join(this.rooms.AGENTS);
        socket.join(`agent-${user.id}`);
        if (user.agencyId) {
          socket.join(`agency-${user.agencyId}`);
        }
        logger.info(`Agent joined rooms: ${socket.id} - Agent: ${user.id}`);
        break;
      
      case 'customer':
        socket.join(this.rooms.CUSTOMERS);
        socket.join(`customer-${user.email}`);
        socket.join('agencies-updates'); // Join agencies updates room for real-time updates
        logger.info(`Customer joined rooms: ${socket.id} - Email: ${user.email}`);
        break;
      
      default:
        logger.info(`Anonymous user connected: ${socket.id}`);
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
        logger.info(`User ${user.id} joined room: ${roomName}`);
      } else {
        socket.emit('error', { message: 'Access denied to room' });
      }
    });

    // Leave specific rooms
    socket.on('leave-room', (roomName) => {
      socket.leave(roomName);
      socket.emit('room-left', { room: roomName });
      logger.info(`User ${user.id} left room: ${roomName}`);
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
        logger.info(`📦 User ${user.email} subscribed to orders updates`);
      } else {
        logger.warn(`❌ Anonymous user tried to subscribe to orders`);
      }
    });

    socket.on('subscribe-products', () => {
      if (user.role !== 'anonymous') {
        socket.join('products-updates');
        socket.emit('subscribed', { type: 'products' });
        logger.info(`📦 User ${user.email} subscribed to products updates`);
      } else {
        logger.warn(`❌ Anonymous user tried to subscribe to products`);
      }
    });

    socket.on('subscribe-agencies', () => {
      if (user.role === 'admin') {
        socket.join('agencies-updates');
        socket.emit('subscribed', { type: 'agencies' });
        logger.info(`🏢 Admin ${user.email} subscribed to agencies updates`);
      } else {
        logger.warn(`❌ Non-admin user ${user.email} tried to subscribe to agencies`);
      }
    });

    socket.on('subscribe-agents', () => {
      if (user.role === 'admin' || user.role === 'agency_owner') {
        socket.join('agents-updates');
        socket.emit('subscribed', { type: 'agents' });
        logger.info(`👥 User ${user.email} subscribed to agents updates`);
      } else {
        logger.warn(`❌ User ${user.email} tried to subscribe to agents without permission`);
      }
    });

    socket.on('subscribe-inventory', (agencyId) => {
      if (user.role === 'admin' || (user.role === 'agency_owner' && user.agencyId === agencyId)) {
        socket.join(`inventory-${agencyId}`);
        socket.emit('subscribed', { type: 'inventory', agencyId });
        logger.info(`📊 User ${user.email} subscribed to inventory updates for agency ${agencyId}`);
      } else {
        logger.warn(`❌ User ${user.email} tried to subscribe to inventory ${agencyId} without permission`);
      }
    });

    // Join specific agency room for real-time product updates
    socket.on('join-agency-room', (data) => {
      const { agencyId } = data;
      if (user.role === 'customer' || user.role === 'admin') {
        socket.join(`agency-${agencyId}`);
        socket.emit('joined-room', { type: 'agency', agencyId });
        logger.info(`🏢 Customer ${user.email} joined agency room: ${agencyId}`);
      } else {
        logger.warn(`❌ User ${user.email} tried to join agency room ${agencyId} without permission`);
      }
    });

    // Leave specific agency room
    socket.on('leave-agency-room', (data) => {
      const { agencyId } = data;
      if (user.role === 'customer' || user.role === 'admin') {
        socket.leave(`agency-${agencyId}`);
        socket.emit('left-room', { type: 'agency', agencyId });
        logger.info(`🏢 Customer ${user.email} left agency room: ${agencyId}`);
      } else {
        logger.warn(`❌ User ${user.email} tried to leave agency room ${agencyId} without permission`);
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
    logger.info(`Socket disconnected: ${socket.id} - User: ${user.email || 'anonymous'}`);
    
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

    logger.info(`Order created notification sent: ${orderData.orderNumber}`);
  }

  emitOrderStatusUpdated(orderData) {
    logger.info(`📤 Emitting order status update: ${orderData.orderNumber} - ${orderData.status}`);
    
    // Emit to admin room
    this.io.to(this.rooms.ADMIN).emit('order:status-updated', {
      type: 'ORDER_STATUS_UPDATED',
      data: orderData,
      timestamp: new Date()
    });
    logger.info(`  ✅ Emitted to ADMIN room`);

    // Emit to agency
    if (orderData.agencyId) {
      this.io.to(`agency-${orderData.agencyId}`).emit('order:status-updated', {
        type: 'ORDER_STATUS_UPDATED',
        data: orderData,
        timestamp: new Date()
      });
      logger.info(`  ✅ Emitted to agency-${orderData.agencyId} room`);
    }

    // Emit to agent
    if (orderData.assignedAgentId) {
      this.io.to(`agent-${orderData.assignedAgentId}`).emit('order:status-updated', {
        type: 'ORDER_STATUS_UPDATED',
        data: orderData,
        timestamp: new Date()
      });
      logger.info(`  ✅ Emitted to agent-${orderData.assignedAgentId} room`);
    }

    // Emit to customer
    if (orderData.customerEmail) {
      const customerRoom = `customer-${orderData.customerEmail}`;
      this.io.to(customerRoom).emit('order:status-updated', {
        type: 'ORDER_STATUS_UPDATED',
        data: orderData,
        timestamp: new Date()
      });
      logger.info(`  ✅ Emitted to ${customerRoom} room`);
      
      // Check if anyone is in this room
      const sockets = this.io.sockets.adapter.rooms.get(customerRoom);
      if (sockets && sockets.size > 0) {
        logger.info(`  👥 ${sockets.size} client(s) in ${customerRoom} room`);
      } else {
        logger.warn(`  ⚠️ No clients in ${customerRoom} room!`);
      }
    }

    // Emit to all subscribed
    this.io.to('orders-updates').emit('order:status-updated', {
      type: 'ORDER_STATUS_UPDATED',
      data: orderData,
      timestamp: new Date()
    });
    logger.info(`  ✅ Emitted to orders-updates room`);

    logger.info(`✅ Order status updated notification sent: ${orderData.orderNumber} - ${orderData.status}`);
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

    logger.info(`Order assigned notification sent: ${orderData.orderNumber} - Agent: ${orderData.agentName}`);
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

    logger.info(`Order delivered notification sent: ${orderData.orderNumber}`);
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

    logger.info(`Product created notification sent: ${productData.productName}`);
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

    logger.info(`Product updated notification sent: ${productData.productName}`);
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
      
      logger.info(`📤 Emitting product:availability-changed to agency-${inventoryData.agencyId} room`);
      logger.info(`📤 Data:`, JSON.stringify(productAvailabilityData, null, 2));
      
      // Emit to specific agency room only
      this.io.to(`agency-${inventoryData.agencyId}`).emit('product:availability-changed', productAvailabilityData);
      
      // Check if anyone is in the specific agency room
      const agencyRoomName = `agency-${inventoryData.agencyId}`;
      const agencySockets = this.io.sockets.adapter.rooms.get(agencyRoomName);
      if (agencySockets && agencySockets.size > 0) {
        logger.info(`📤 ${agencySockets.size} client(s) in ${agencyRoomName} room - Event will be delivered ✅`);
      } else {
        logger.warn(`📤 ⚠️ No clients in ${agencyRoomName} room - Event will NOT be received!`);
      }
      
      // Check total connected clients
      const totalClients = this.io.sockets.sockets.size;
      logger.info(`📤 Total connected clients: ${totalClients}`);
    }

    logger.info(`Inventory updated notification sent: ${inventoryData.productName} - Agency: ${inventoryData.agencyId}`);
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

    logger.info(`Low stock alert sent: ${inventoryData.productName} - Stock: ${inventoryData.stock}`);
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

    logger.info(`Agency created notification sent: ${agencyData.name}`);
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

    logger.info(`Agency updated notification sent: ${agencyData.name}`);
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

    logger.info(`Agent created notification sent: ${agentData.name}`);
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

    logger.info(`Agent updated notification sent: ${agentData.name}`);
  }

  emitAgentStatusUpdated(agentData) {
    logger.info(`📤 Emitting agent status update: ${agentData.name} - ${agentData.status}`);
    
    // Emit to admin room
    this.io.to(this.rooms.ADMIN).emit('agent:status-updated', {
      type: 'AGENT_STATUS_UPDATED',
      data: agentData,
      timestamp: new Date()
    });
    logger.info(`  ✅ Emitted to ADMIN room`);

    // Emit to agency owner room
    if (agentData.agencyId) {
      this.io.to(`agency-${agentData.agencyId}`).emit('agent:status-updated', {
        type: 'AGENT_STATUS_UPDATED',
        data: agentData,
        timestamp: new Date()
      });
      logger.info(`  ✅ Emitted to agency-${agentData.agencyId} room`);
    }

    // Emit to specific agent room
    this.io.to(`agent-${agentData.id}`).emit('agent:status-updated', {
      type: 'AGENT_STATUS_UPDATED',
      data: agentData,
      timestamp: new Date()
    });
    logger.info(`  ✅ Emitted to agent-${agentData.id} room`);

    // Emit to agents-updates room for all subscribed users
    this.io.to('agents-updates').emit('agent:status-updated', {
      type: 'AGENT_STATUS_UPDATED',
      data: agentData,
      timestamp: new Date()
    });
    logger.info(`  ✅ Emitted to agents-updates room`);

    logger.info(`✅ Agent status updated notification sent: ${agentData.name} - ${agentData.status}`);
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

    logger.info(`Generic notification sent: ${type}`);
  }

  // Broadcast system message
  broadcastSystemMessage(message, type = 'info') {
    this.io.emit('system:message', {
      type: 'SYSTEM_MESSAGE',
      message,
      messageType: type,
      timestamp: new Date()
    });

    logger.info(`System message broadcasted: ${message}`);
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

    logger.info(`Terms & Conditions created notification sent: ${termsData.title}`);
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

    logger.info(`Terms & Conditions updated notification sent: ${termsData.title}`);
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

    logger.info(`Privacy Policy created notification sent: ${policyData.title}`);
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

    logger.info(`Privacy Policy updated notification sent: ${policyData.title}`);
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

    logger.info(`Tax configuration updated notification sent`);
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

    logger.info(`Tax configuration deleted notification sent`);
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

    logger.info(`Platform charge updated notification sent`);
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

    logger.info(`Platform charge deleted notification sent`);
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

    logger.info(`Delivery charge created notification sent for agency ${deliveryChargeData.agencyId}`);
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

    logger.info(`Delivery charge updated notification sent for agency ${deliveryChargeData.agencyId}`);
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

    logger.info(`Delivery charge deleted notification sent for agency ${deliveryChargeData.agencyId}`);
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

    logger.info(`Coupon created notification sent: ${couponData.code}`);
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

    logger.info(`Coupon updated notification sent: ${couponData.code}`);
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

    logger.info(`Coupon status changed notification sent: ${couponData.code} - Active: ${couponData.isActive}`);
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

    logger.info(`Coupon deleted notification sent: ${couponData.code}`);
  }

  // Send message to specific user by email
  sendToUserByEmail(email, eventName, data, userType = 'customer') {
    // Determine the room based on user type
    const userRoom = userType === 'agency_owner' ? `agency-owner-${email}` : `customer-${email}`;
    
    logger.info(`📤 Sending ${eventName} to ${userType} ${email}`);
    logger.info(`   Room: ${userRoom}`);
    
    // Check if anyone is in this room
    const sockets = this.io.sockets.adapter.rooms.get(userRoom);
    if (sockets && sockets.size > 0) {
      logger.info(`   👥 ${sockets.size} client(s) in room - Event will be delivered ✅`);
    } else {
      logger.warn(`   ⚠️ No clients in room ${userRoom} - Event will NOT be received!`);
      logger.warn(`   User might be offline or not connected via socket`);
    }
    
    this.io.to(userRoom).emit(eventName, {
      type: eventName.toUpperCase().replace(':', '_'),
      data,
      timestamp: new Date()
    });

    logger.info(`✅ ${eventName} event emitted to ${email}`);
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
}

// Export singleton instance
module.exports = new SocketService();
