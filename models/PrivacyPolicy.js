const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const PrivacyPolicy = sequelize.define('PrivacyPolicy', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  title: {
    type: DataTypes.STRING,
    allowNull: false,
    validate: {
      len: [2, 200]
    }
  },
  description: {
    type: DataTypes.TEXT,
    allowNull: false,
    validate: {
      len: [10, 10000]
    }
  },
  status: {
    type: DataTypes.ENUM('active', 'inactive'),
    defaultValue: 'active'
  },
  version: {
    type: DataTypes.STRING,
    allowNull: false,
    defaultValue: '1.0',
    validate: {
      len: [1, 20]
    }
  },
  lastUpdatedBy: {
    type: DataTypes.UUID,
    allowNull: true,
    references: {
      model: 'users',
      key: 'id'
    }
  }
}, {
  tableName: 'privacy_policies',
  timestamps: true
});

module.exports = PrivacyPolicy;
