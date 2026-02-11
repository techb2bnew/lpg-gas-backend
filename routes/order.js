const express = require('express');
const router = express.Router();
const orderController = require('../controllers/orderController');
const { authenticate } = require('../middleware/auth');
const uploadDeliveryProof = require('../middleware/deliveryProofUpload');



// Customer routes (no authentication required for checkout and payment)
router.post('/checkout', orderController.createOrderHandler);
router.post('/create-draft', orderController.createDraftOrderHandler); // Create draft order for online payment (no stock deduction)
router.post('/payment', orderController.orderpesapalPayment);
router.get('/payment/status/:orderId', orderController.getPesapalPaymentStatus);

// Admin/Agent routes (require authentication)
router.use(authenticate);

router.post('/orderdetails', orderController.orderDetailslist);

router.get('/', orderController.getAllOrders);
router.get('/:id', orderController.getOrderById);
router.get('/status/:status', orderController.getOrdersByStatus);

// Customer-specific routes
router.get('/customer/summary', orderController.getCustomerOrdersSummary);

// Agent-specific routes
router.get('/agent/history', orderController.getAgentDeliveryHistory);
router.get('/agent/stats', orderController.getAgentDeliveryStats);

// Product routes - REMOVED (these belong in product routes, not order routes)

// Order management routes
router.put('/:id/status', orderController.updateOrderStatusHandler);
router.put('/:id/assign', orderController.assignAgentHandler);
router.post('/:id/send-otp', orderController.sendOTPHandler);
router.post('/:id/verify-otp', uploadDeliveryProof.single('deliveryProof'), orderController.verifyOTPHandler);
router.put('/:id/cancel', orderController.cancelOrderHandler);
router.put('/:id/return', orderController.returnOrderHandler);
router.put('/:id/payment', orderController.markPaymentReceivedHandler);





module.exports = router;
