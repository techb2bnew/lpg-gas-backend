const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const Notification = sequelize.define('Notification', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  // User who will see this notification
  userId: {
    type: DataTypes.UUID,
    allowNull: false,
    references: {
      model: 'users',
      key: 'id'
    },
    field: 'user_id',
    comment: 'User who will see this notification in their app'
  },
  // Notification content
  title: {
    type: DataTypes.STRING,
    allowNull: false
  },
  content: {
    type: DataTypes.TEXT,
    allowNull: false
  },
  // Notification type
  notificationType: {
    type: DataTypes.ENUM(
      'ORDER_STATUS',
      'NEW_ORDER',
      'ORDER_ASSIGNED',
      'PROMOTION',
      'PAYMENT',
      'CUSTOM',
      'OTHER'
    ),
    allowNull: false,
    defaultValue: 'OTHER',
    field: 'notification_type'
  },
  // Data payload for app navigation
  data: {
    type: DataTypes.JSONB,
    allowNull: true,
    comment: 'Additional data for navigation (orderId, etc.)'
  },
  // Related entities
  orderId: {
    type: DataTypes.UUID,
    allowNull: true,
    references: {
      model: 'orders',
      key: 'id'
    },
    field: 'order_id'
  },
  // Read status
  isRead: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
    allowNull: false,
    field: 'is_read'
  },
  // Read timestamp
  readAt: {
    type: DataTypes.DATE,
    allowNull: true,
    field: 'read_at'
  }
}, {
  tableName: 'notifications',
  timestamps: true,
  indexes: [
    {
      fields: ['user_id']
    },
    {
      fields: ['user_id', 'is_read']
    },
    {
      fields: ['order_id']
    },
    {
      fields: ['notification_type']
    },
    {
      fields: ['created_at']
    }
  ]
});

module.exports = Notification;

