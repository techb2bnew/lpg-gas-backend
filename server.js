const app = require('./app');
const config = require('./config/database');
const logger = require('./utils/logger');
const { Server } = require('socket.io');
const http = require('http');
const socketService = require('./services/socketService');
const { initializeFirebase, initializeFirebaseDriver } = require('./config/firebase');

const PORT = process.env.PORT || 5000;

// Create HTTP server
const server = http.createServer(app);

// Initialize Socket.IO with enhanced configuration
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST", "PUT", "DELETE"],
    allowedHeaders: ["Content-Type", "Authorization"],
    credentials: false
  },
  transports: ['websocket', 'polling'],
  pingTimeout: 60000,
  pingInterval: 25000
});

// Initialize Socket Service
socketService.initialize(io);

// Initialize Firebase for push notifications
initializeFirebase();

initializeFirebaseDriver();
// Make socket service available globally
global.socketService = socketService;

// Test database connection
config.sequelize.authenticate()
  .then(() => {
   
    // Sync database (in development)
    if (process.env.NODE_ENV === 'development') {
      return config.sequelize.sync({ alter: true });
    }
  })
  .then(() => {
    // Start server
    server.listen(PORT, () => {
      
    });
  })
  .catch((error) => {
    console.error("❌ Startup failed:", error);
    process.exit(1);
  });

// Handle unhandled promise rejections
process.on('unhandledRejection', (err) => {
  console.error("❌ unhandledRejection:", err);
  process.exit(1);
});

// Handle uncaught exceptions
process.on('uncaughtException', (err) => {
  console.error("❌ uncaughtException:", err);
  process.exit(1);
});
