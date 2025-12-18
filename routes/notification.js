const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const {
  getUserNotifications,
  getUnreadCount,
  markAsRead,
  markAllAsRead,
  deleteNotification,
  deleteAllNotifications
} = require('../controllers/notificationController');

// All notification routes require authentication
router.use(authenticate);

// Get user notifications
router.get('/', getUserNotifications);

// Get unread notification count
router.get('/unread-count', getUnreadCount);

// Mark notification as read
router.patch('/:id/read', markAsRead);

// Mark all notifications as read
router.patch('/read-all', markAllAsRead);

// Delete notification
router.delete('/:id', deleteNotification);

// Delete all notifications
router.delete('/', deleteAllNotifications);

module.exports = router;

