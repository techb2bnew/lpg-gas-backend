const { Notification, User, AgencyOwner } = require('../models');
const { createError } = require('../utils/errorHandler');
const logger = require('../utils/logger');
const { Op } = require('sequelize');

// Get user notifications
const getUserNotifications = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { page = 1, limit = 20, isRead, notificationType } = req.query;
    const offset = (page - 1) * limit;

    // Calculate date 60 days ago
    const sixtyDaysAgo = new Date();
    sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60);

    // Build where clause
    const whereClause = { 
      userId,
      createdAt: {
        [Op.gte]: sixtyDaysAgo
      }
    };

    if (isRead !== undefined) {
      whereClause.isRead = isRead === 'true';
    }

    if (notificationType) {
      whereClause.notificationType = notificationType;
    }

    const notifications = await Notification.findAndCountAll({
      where: whereClause,
      limit: parseInt(limit),
      offset: parseInt(offset),
      order: [['createdAt', 'DESC']]
    });

    const totalPages = Math.ceil(notifications.count / limit);

    res.status(200).json({
      success: true,
      message: 'Notifications retrieved successfully',
      data: {
        notifications: notifications.rows,
        pagination: {
          currentPage: parseInt(page),
          totalPages,
          totalItems: notifications.count,
          itemsPerPage: parseInt(limit)
        }
      }
    });
  } catch (error) {
    next(error);
  }
};

// Get unread notification count
const getUnreadCount = async (req, res, next) => {
  try {
    const userId = req.user.id;

    const unreadCount = await Notification.count({
      where: {
        userId,
        isRead: false
      }
    });

    res.status(200).json({
      success: true,
      message: 'Unread count retrieved successfully',
      data: {
        unreadCount
      }
    });
  } catch (error) {
    next(error);
  }
};

// Mark notification as read
const markAsRead = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { id } = req.params;

    const notification = await Notification.findOne({
      where: {
        id,
        userId
      }
    });

    if (!notification) {
      return next(createError(404, 'Notification not found'));
    }

    await notification.update({
      isRead: true,
      readAt: new Date()
    });

    res.status(200).json({
      success: true,
      message: 'Notification marked as read',
      data: { notification }
    });
  } catch (error) {
    next(error);
  }
};

// Mark all notifications as read
const markAllAsRead = async (req, res, next) => {
  try {
    const userId = req.user.id;

    const result = await Notification.update(
      {
        isRead: true,
        readAt: new Date()
      },
      {
        where: {
          userId,
          isRead: false
        }
      }
    );

    res.status(200).json({
      success: true,
      message: 'All notifications marked as read',
      data: {
        updatedCount: result[0]
      }
    });
  } catch (error) {
    next(error);
  }
};

// Register or update FCM token for the authenticated user (web/admin/agency portal)
const registerToken = async (req, res, next) => {
  try {
    const userId = req.user.userId || req.user.id;
    const { fcmToken, platform, deviceInfo } = req.body || {};

    if (!fcmToken) {
      return next(createError(400, 'fcmToken is required'));
    }

    // Try to find user in primary User table first
    let user = null;

    if (userId) {
      user = await User.findByPk(userId);
    }

    // Fallback to AgencyOwner table for agency portal users
    if (!user && userId) {
      const owner = await AgencyOwner.findByPk(userId);
      if (owner) {
        user = owner;
      }
    }

    if (!user) {
      return next(createError(404, 'User not found'));
    }

    // Normalize platform/device type for storage
    const deviceType =
      platform ||
      deviceInfo?.platform ||
      'web';

    await user.update({
      fcmToken,
      fcmDeviceType: deviceType
    });

    logger.info(`FCM token registered for user ${user.email || user.id} (${deviceType})`);

    res.status(200).json({
      success: true,
      message: 'Notification token registered successfully',
      data: {
        userId: user.id,
        platform: deviceType
      }
    });
  } catch (error) {
    logger.error('Error registering notification token:', error.message);
    next(error);
  }
};

module.exports = {
  getUserNotifications,
  getUnreadCount,
  markAsRead,
  markAllAsRead,
  registerToken
};

