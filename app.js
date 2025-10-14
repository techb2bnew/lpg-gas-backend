const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const morgan = require('morgan');
const fixAgencyPassword = require('./middleware/agencyPasswordFix');
require('dotenv').config();

const app = express();

// Security middleware
app.use(helmet());

// CORS configuration - Allow all origins
app.use(cors({
  origin: '*', // Allow all origins
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: [
    'Content-Type', 
    'Authorization', 
    'X-Requested-With', 
    'ngrok-skip-browser-warning',
    'Accept',
    'Origin',
    'Access-Control-Request-Method',
    'Access-Control-Request-Headers',
    'Access-Control-Allow-Origin',
    'Access-Control-Allow-Methods',
    'Access-Control-Allow-Headers'
  ],
  credentials: false,
  preflightContinue: false,
  optionsSuccessStatus: 204
}));

// Static file serving removed - using Cloudinary for image storage

// Additional CORS middleware for preflight requests
app.use((req, res, next) => {
  // Set CORS headers
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, PATCH, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With, ngrok-skip-browser-warning, Accept, Origin, Access-Control-Request-Method, Access-Control-Request-Headers');
  res.header('Access-Control-Allow-Credentials', 'false');
  res.header('Access-Control-Max-Age', '86400'); // 24 hours
  
  // Handle preflight requests
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }
  
  next();
});

// Compression middleware
app.use(compression());

// Logging middleware
if (process.env.NODE_ENV === 'development') {
  app.use(morgan('dev'));
} else {
  app.use(morgan('combined'));
}

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Agency password fix middleware (must be before routes)
app.use(fixAgencyPassword);

// Static files
app.use('/uploads', express.static('uploads'));

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'OK',
    message: 'Server is running',
    timestamp: new Date().toISOString()
  });
});

// Test endpoint to verify routing
app.get('/test', (req, res) => {
  res.status(200).json({
    success: true,
    message: 'Root test route working',
    timestamp: new Date().toISOString()
  });
});

// API routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/delivery-agents', require('./routes/deliveryAgent'));

// Product routes with debugging
console.log('Loading product routes...');
try {
  const productRoutes = require('./routes/product');
  console.log('Product routes loaded successfully:', typeof productRoutes);
  console.log('Product routes object:', productRoutes);
  app.use('/api/products', productRoutes);
  console.log('Product routes registered at /api/products');
} catch (error) {
  console.error('Error loading product routes:', error);
  process.exit(1);
}

app.use('/api/orders', require('./routes/order'));
app.use('/api/addresses', require('./routes/address'));
app.use('/api/agencies', require('./routes/agency'));
app.use('/api/dashboard', require('./routes/dashboard'));

// Admin routes for Terms & Conditions and Privacy Policy
app.use('/api/admin/terms-and-conditions', require('./routes/termsAndConditions'));
app.use('/api/admin/privacy-policies', require('./routes/privacyPolicy'));

// Category routes
app.use('/api/categories', require('./routes/category'));

// Tax routes
app.use('/api/tax', require('./routes/tax'));

// Platform charge routes
app.use('/api/platform-charge', require('./routes/platformCharge'));

// Coupon routes
app.use('/api/coupons', require('./routes/coupon'));

// Delivery charge routes
app.use('/api/delivery-charges', require('./routes/deliveryCharge'));

// Public routes for Terms & Conditions and Privacy Policy
app.use('/api/public', require('./routes/public'));

// 404 handler
app.use(require('./middleware/notFound'));

// Error handler
app.use(require('./middleware/errorHandler'));

module.exports = app;
