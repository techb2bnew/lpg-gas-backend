Socket.IO Client Install karo:
npm install socket.io-client
# ya
yarn add socket.io-client

Environment Variables setup karo:
// .env file mein
REACT_APP_SOCKET_URL=http://localhost:5000
REACT_APP_API_URL=http://localhost:5000/api

# 🔥 API Endpoints & Socket Events Mapping

## Complete List - API Endpoints aur Socket Events

---

## 📦 **ORDER APIs & Socket Events**

### 1. **Create Order**
```javascript
// API Endpoint
POST /api/orders

// Socket Event Emitted
socket.on('order:created', (data) => {
  // data.data contains:
  // - orderId, orderNumber, customerName, customerEmail
  // - totalAmount, agencyId, status
});
```

### 2. **Update Order Status**
```javascript
// API Endpoint  
PUT /api/orders/:id/status

// Socket Event Emitted
socket.on('order:status-updated', (data) => {
  // data.data contains:
  // - orderId, orderNumber, status, customerEmail
  // - agencyId, assignedAgentId
});
```

### 3. **Assign Agent to Order**
```javascript
// API Endpoint
PUT /api/orders/:id/assign-agent

// Socket Event Emitted
socket.on('order:assigned', (data) => {
  // data.data contains:
  // - orderId, orderNumber, agentId, agentName
  // - assignedAgentId, customerEmail, agencyId
});
```

### 4. **Send OTP for Delivery**
```javascript
// API Endpoint
POST /api/orders/:id/send-otp

// Socket Event Emitted
socket.on('order:status-updated', (data) => {
  // data.data contains:
  // - orderId, orderNumber, status: 'out_for_delivery'
  // - customerEmail, agencyId, assignedAgentId, otpSent: true
});
```

### 5. **Verify OTP & Complete Delivery**
```javascript
// API Endpoint
POST /api/orders/:id/verify-otp

// Socket Event Emitted
socket.on('order:delivered', (data) => {
  // data.data contains:
  // - orderId, orderNumber, deliveryProof, paymentReceived
  // - customerEmail, agencyId, assignedAgentId
});
```

### 6. **Cancel Order**
```javascript
// API Endpoint
PUT /api/orders/:id/cancel

// Socket Event Emitted
socket.on('order:status-updated', (data) => {
  // data.data contains:
  // - orderId, orderNumber, status: 'cancelled'
  // - customerEmail, agencyId, assignedAgentId, reason
});
```

### 7. **Return Order**
```javascript
// API Endpoint
PUT /api/orders/:id/return

// Socket Event Emitted
socket.on('order:status-updated', (data) => {
  // data.data contains:
  // - orderId, orderNumber, status: 'returned'
  // - customerEmail, agencyId, assignedAgentId, reason
});
```

### 8. **Mark Payment Received**
```javascript
// API Endpoint
PUT /api/orders/:id/payment-received

// Socket Event Emitted
socket.on('order:status-updated', (data) => {
  // data.data contains:
  // - orderId, orderNumber, status: 'delivered'
  // - customerEmail, agencyId, paymentReceived, deliveredAt
});
```

---

## 🛍️ **PRODUCT APIs & Socket Events**

### 1. **Create Product**
```javascript
// API Endpoint
POST /api/products

// Socket Event Emitted
socket.on('product:created', (data) => {
  // data.data contains:
  // - id, productName, category, status, createdBy
});
```

### 2. **Update Product**
```javascript
// API Endpoint
PUT /api/products/:id

// Socket Event Emitted
socket.on('product:updated', (data) => {
  // data.data contains:
  // - id, productName, category, status, updatedBy
});
```

### 3. **Update Product Status**
```javascript
// API Endpoint
PUT /api/products/:id/status

// Socket Event Emitted
socket.on('product:updated', (data) => {
  // data.data contains:
  // - id, productName, category, status, updatedBy
});
```

---

## 📊 **INVENTORY APIs & Socket Events**

### 1. **Add Product to Agency Inventory**
```javascript
// API Endpoint
POST /api/products/:productId/agencies/:agencyId

// Socket Event Emitted
socket.on('inventory:updated', (data) => {
  // data.data contains:
  // - productId, productName, agencyId, agencyName
  // - stock, lowStockThreshold, action: 'added'
});
```

### 2. **Update Agency Inventory**
```javascript
// API Endpoint
PUT /api/products/:productId/agencies/:agencyId

// Socket Event Emitted
socket.on('inventory:updated', (data) => {
  // data.data contains:
  // - productId, productName, agencyId, agencyName
  // - stock, lowStockThreshold, action: 'updated'
});

// PLUS Low Stock Alert (if stock <= threshold)
socket.on('inventory:low-stock', (data) => {
  // data.data contains:
  // - productId, productName, agencyId, agencyName
  // - stock, lowStockThreshold
});
```

### 3. **Remove Product from Agency**
```javascript
// API Endpoint
DELETE /api/products/:productId/agencies/:agencyId

// Socket Event Emitted
socket.on('inventory:updated', (data) => {
  // data.data contains:
  // - productId, productName, agencyId, agencyName
  // - action: 'removed'
});
```

---

## 🏢 **AGENCY APIs & Socket Events**

### 1. **Create Agency**
```javascript
// API Endpoint
POST /api/agencies

// Socket Event Emitted
socket.on('agency:created', (data) => {
  // data.data contains:
  // - id, name, email, city, status, createdBy
});
```

### 2. **Update Agency**
```javascript
// API Endpoint
PUT /api/agencies/:id

// Socket Event Emitted
socket.on('agency:updated', (data) => {
  // data.data contains:
  // - id, name, email, city, status, updatedBy
});
```

### 3. **Update Agency Status (Active/Inactive)**
```javascript
// API Endpoint
PUT /api/agencies/:id/status

// Socket Event Emitted
socket.on('agency:updated', (data) => {
  // data.data contains:
  // - id, name, email, status, updatedBy, statusChanged: true
});

// PLUS Force Logout (if deactivated)
socket.on('agency:force-logout', (data) => {
  // data.data contains:
  // - type: 'AGENCY_DEACTIVATED'
  // - message: 'Your agency has been deactivated...'
});
```

---

## 🚚 **DELIVERY AGENT APIs & Socket Events**

### 1. **Create Delivery Agent**
```javascript
// API Endpoint
POST /api/delivery-agents

// Socket Event Emitted
socket.on('agent:created', (data) => {
  // data.data contains:
  // - id, name, email, phone, agencyId, status, createdBy
});
```

### 2. **Update Delivery Agent**
```javascript
// API Endpoint
PUT /api/delivery-agents/:id

// Socket Event Emitted
socket.on('agent:updated', (data) => {
  // data.data contains:
  // - id, name, email, phone, agencyId, status, updatedBy
});
```

---

## 🔐 **AUTH APIs & Socket Events**

### 1. **User Login**
```javascript
// API Endpoint
POST /api/auth/login

// Socket Event Emitted
socket.on('notification', (data) => {
  // data.data contains:
  // - userId, email, role, name, loginTime
  // - type: 'USER_LOGGED_IN'
});
```

### 2. **Block/Unblock User**
```javascript
// API Endpoint
PUT /api/auth/users/:id/block

// Socket Event Emitted
socket.on('notification', (data) => {
  // data.data contains:
  // - userId, email, role, name, isBlocked, blockedBy, timestamp
  // - type: 'USER_BLOCK_STATUS_CHANGED'
});

// PLUS Force Logout (if blocked)
socket.on('user:force-logout', (data) => {
  // data.data contains:
  // - type: 'ACCOUNT_BLOCKED'
  // - message: 'Your account has been blocked...'
});
```

---

## 📋 **TERMS & CONDITIONS APIs & Socket Events**

### 1. **Create Terms & Conditions**
```javascript
// API Endpoint
POST /api/terms-and-conditions

// Socket Event Emitted
socket.on('terms:created', (data) => {
  // data.data contains:
  // - id, title, status, createdBy
});
```

### 2. **Update Terms & Conditions**
```javascript
// API Endpoint
PUT /api/terms-and-conditions/:id

// Socket Event Emitted
socket.on('terms:updated', (data) => {
  // data.data contains:
  // - id, title, status, updatedBy
});
```

---

## 🔒 **PRIVACY POLICY APIs & Socket Events**

### 1. **Create Privacy Policy**
```javascript
// API Endpoint
POST /api/privacy-policy

// Socket Event Emitted
socket.on('privacy:created', (data) => {
  // data.data contains:
  // - id, title, status, createdBy
});
```

### 2. **Update Privacy Policy**
```javascript
// API Endpoint
PUT /api/privacy-policy/:id

// Socket Event Emitted
socket.on('privacy:updated', (data) => {
  // data.data contains:
  // - id, title, status, updatedBy
});
```

---

## 🔔 **SYSTEM Events**

### 1. **System Messages**
```javascript
// Emitted by Admin/System
socket.on('system:message', (data) => {
  // data contains:
  // - type: 'SYSTEM_MESSAGE'
  // - message: 'System maintenance tonight'
  // - messageType: 'info'/'warning'/'error'/'success'
  // - timestamp
});
```

### 2. **Generic Notifications**
```javascript
// Custom notifications
socket.on('notification', (data) => {
  // data contains:
  // - type: 'CUSTOM_NOTIFICATION'
  // - data: { custom data }
  // - timestamp
});
```

---

## 🎯 **Frontend Usage Examples**

### **Complete Setup**
```javascript
import io from 'socket.io-client';

// Connect to Socket.IO
const socket = io('http://localhost:5000', {
  auth: { token: localStorage.getItem('authToken') }
});

// Connection Events
socket.on('connect', () => {
  console.log('✅ Connected');
  
  // Subscribe to updates based on user role
  if (userRole === 'admin') {
    socket.emit('subscribe-orders');
    socket.emit('subscribe-products');
    socket.emit('subscribe-agencies');
  } else if (userRole === 'agency_owner') {
    socket.emit('subscribe-orders');
    socket.emit('subscribe-inventory', agencyId);
  } else if (userRole === 'customer') {
    socket.emit('subscribe-orders');
  } else if (userRole === 'agent') {
    socket.emit('subscribe-orders');
  }
});
```

### **Order Events Handler**
```javascript
// All Order Events
socket.on('order:created', handleOrderCreated);
socket.on('order:status-updated', handleOrderStatusUpdated);
socket.on('order:assigned', handleOrderAssigned);
socket.on('order:delivered', handleOrderDelivered);

function handleOrderCreated(data) {
  const order = data.data;
  console.log(`New Order: ${order.orderNumber}`);
  
  // Update UI
  setOrders(prev => [order, ...prev]);
  
  // Show notification
  showNotification(`New order from ${order.customerName}`, 'success');
}

function handleOrderStatusUpdated(data) {
  const order = data.data;
  console.log(`Order ${order.orderNumber} status: ${order.status}`);
  
  // Update specific order
  setOrders(prev => prev.map(o => 
    o.orderId === order.orderId 
      ? { ...o, status: order.status }
      : o
  ));
  
  // Show status notification
  showNotification(`Order ${order.orderNumber}: ${order.status}`, 'info');
}
```

### **Product Events Handler**
```javascript
// Product Events
socket.on('product:created', (data) => {
  const product = data.data;
  setProducts(prev => [product, ...prev]);
  showNotification(`New product: ${product.productName}`, 'info');
});

socket.on('product:updated', (data) => {
  const product = data.data;
  setProducts(prev => prev.map(p => 
    p.id === product.id ? product : p
  ));
});
```

### **Inventory Events Handler**
```javascript
// Inventory Events
socket.on('inventory:updated', (data) => {
  const inventory = data.data;
  console.log(`Stock updated: ${inventory.productName} - ${inventory.stock}`);
  
  // Update inventory display
  updateInventoryStock(inventory.productId, inventory.stock);
});

socket.on('inventory:low-stock', (data) => {
  const alert = data.data;
  console.log(`LOW STOCK ALERT: ${alert.productName}`);
  
  // Show urgent notification
  showUrgentAlert(
    `LOW STOCK: ${alert.productName} - Only ${alert.stock} left!`,
    'warning'
  );
});
```

---

## 🔐 **Role-based Event Filtering**

### **Customer (Role: 'customer')**
```javascript
// Customers receive events for THEIR orders only
socket.on('order:status-updated', (data) => {
  // Server automatically filters by customerEmail
  // Customer only gets their own order updates
});
```

### **Agency Owner (Role: 'agency_owner')**
```javascript
// Agency owners receive events for THEIR agency only
socket.emit('subscribe-inventory', agencyId);
socket.on('inventory:low-stock', (data) => {
  // Only their agency's inventory alerts
});
```

### **Delivery Agent (Role: 'agent')**
```javascript
// Agents receive events for orders ASSIGNED to them
socket.on('order:assigned', (data) => {
  // Only orders assigned to this agent
});
```

### **Admin (Role: 'admin')**
```javascript
// Admins receive ALL events
socket.emit('subscribe-orders');
socket.emit('subscribe-products');
socket.emit('subscribe-agencies');
// Admin gets everything
```

---

## 📱 **Quick Reference Table**

| API Endpoint | Method | Socket Event | Event Data |
|-------------|--------|--------------|------------|
| `/api/orders` | POST | `order:created` | orderId, orderNumber, customerName |
| `/api/orders/:id/status` | PUT | `order:status-updated` | orderId, status, customerEmail |
| `/api/orders/:id/assign-agent` | PUT | `order:assigned` | orderId, agentId, agentName |
| `/api/orders/:id/verify-otp` | POST | `order:delivered` | orderId, deliveryProof |
| `/api/products` | POST | `product:created` | id, productName, category |
| `/api/products/:id` | PUT | `product:updated` | id, productName, status |
| `/api/products/:pid/agencies/:aid` | POST | `inventory:updated` | productId, stock, action |
| `/api/products/:pid/agencies/:aid` | PUT | `inventory:updated` + `inventory:low-stock` | productId, stock |
| `/api/agencies` | POST | `agency:created` | id, name, email |
| `/api/agencies/:id/status` | PUT | `agency:updated` + `agency:force-logout` | id, status, statusChanged |
| `/api/delivery-agents` | POST | `agent:created` | id, name, email, agencyId |
| `/api/delivery-agents/:id` | PUT | `agent:updated` | id, name, email, agencyId |
| `/api/auth/login` | POST | `notification` (USER_LOGGED_IN) | userId, email, role, loginTime |
| `/api/auth/users/:id/block` | PUT | `notification` + `user:force-logout` | userId, isBlocked, blockedBy |
| `/api/terms-and-conditions` | POST | `terms:created` | id, title, status |
| `/api/terms-and-conditions/:id` | PUT | `terms:updated` | id, title, status |
| `/api/privacy-policy` | POST | `privacy:created` | id, title, status |
| `/api/privacy-policy/:id` | PUT | `privacy:updated` | id, title, status |

---

## 🎉 **Ready to Use!**

**Ye complete mapping hai sari APIs aur Socket events ki. Aap easily dekh sakte hain ki kaunsa API call karne par kaunsa Socket event emit hoga!** 🔥

**Koi specific API ya event ke bare mein aur detail chahiye?**


// utils/socket.js - Ek centralized socket file banao
import io from 'socket.io-client';

class SocketService {
  constructor() {
    this.socket = null;
    this.isConnected = false;
  }

  connect(token) {
    if (!this.socket) {
      this.socket = io(process.env.REACT_APP_SOCKET_URL, {
        auth: { token },
        transports: ['websocket', 'polling'],
        timeout: 20000,
        forceNew: true
      });

      this.setupEventListeners();
    }
    return this.socket;
  }

  setupEventListeners() {
    this.socket.on('connect', () => {
      console.log('✅ Socket Connected');
      this.isConnected = true;
    });

    this.socket.on('disconnect', () => {
      console.log('❌ Socket Disconnected');
      this.isConnected = false;
    });

    this.socket.on('connect_error', (error) => {
      console.error('Socket Connection Error:', error);
    });
  }

  disconnect() {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
      this.isConnected = false;
    }
  }
}

export default new SocketService();



// context/SocketContext.js
import React, { createContext, useContext, useEffect, useState } from 'react';
import socketService from '../utils/socket';

const SocketContext = createContext();

export const useSocket = () => {
  const context = useContext(SocketContext);
  if (!context) {
    throw new Error('useSocket must be used within SocketProvider');
  }
  return context;
};

export const SocketProvider = ({ children }) => {
  const [socket, setSocket] = useState(null);
  const [isConnected, setIsConnected] = useState(false);

  useEffect(() => {
    const token = localStorage.getItem('authToken');
    if (token) {
      const socketInstance = socketService.connect(token);
      setSocket(socketInstance);

      socketInstance.on('connect', () => setIsConnected(true));
      socketInstance.on('disconnect', () => setIsConnected(false));

      return () => {
        socketService.disconnect();
      };
    }
  }, []);

  return (
    <SocketContext.Provider value={{ socket, isConnected }}>
      {children}
    </SocketContext.Provider>
  );
};


// hooks/useForceLogout.js
import { useEffect } from 'react';
import { useSocket } from '../context/SocketContext';
import { useNavigate } from 'react-router-dom';
import { toast } from 'react-toastify';

export const useForceLogout = () => {
  const { socket } = useSocket();
  const navigate = useNavigate();

  useEffect(() => {
    if (!socket) return;

    const handleForceLogout = (data) => {
      const { type, message } = data.data;
      
      // Show alert
      toast.error(message, { autoClose: 5000 });
      
      // Clear all storage
      localStorage.clear();
      sessionStorage.clear();
      
      // Redirect to login
      setTimeout(() => {
        navigate('/login');
      }, 2000);
    };

    // Listen for both force logout events
    socket.on('user:force-logout', handleForceLogout);
    socket.on('agency:force-logout', handleForceLogout);

    return () => {
      socket.off('user:force-logout', handleForceLogout);
      socket.off('agency:force-logout', handleForceLogout);
    };
  }, [socket, navigate]);
};