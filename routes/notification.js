const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const {
  getUserNotifications,
  getUnreadCount,
  markAsRead,
  markAllAsRead,
  registerToken
} = require('../controllers/notificationController');

// All notification routes require authentication
router.use(authenticate);

// Register FCM/web push token for current user (used by admin/agency portal)
router.post('/register-token', registerToken);

// Get user notifications
router.get('/', getUserNotifications);

// Get unread notification count
router.get('/unread-count', getUnreadCount);

// Mark notification as read
router.put('/:id/read', markAsRead);

// Mark all notifications as read
router.put('/read-all', markAllAsRead);


module.exports = router;

