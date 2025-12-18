const { Notification } = require('../models');
const { createError } = require('../utils/errorHandler');
const logger = require('../utils/logger');
const { Op } = require('sequelize');

// Get user notifications
const getUserNotifications = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { page = 1, limit = 20, isRead, notificationType } = req.query;
    const offset = (page - 1) * limit;

    // Build where clause
    const whereClause = { userId };

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

// Delete notification
const deleteNotification = async (req, res, next) => {
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

    await notification.destroy();

    res.status(200).json({
      success: true,
      message: 'Notification deleted successfully'
    });
  } catch (error) {
    next(error);
  }
};

// Delete all notifications
const deleteAllNotifications = async (req, res, next) => {
  try {
    const userId = req.user.id;

    const result = await Notification.destroy({
      where: { userId }
    });

    res.status(200).json({
      success: true,
      message: 'All notifications deleted successfully',
      data: {
        deletedCount: result
      }
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getUserNotifications,
  getUnreadCount,
  markAsRead,
  markAllAsRead,
  deleteNotification,
  deleteAllNotifications
};

