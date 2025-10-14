const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const LoginOTP = sequelize.define('LoginOTP', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  email: {
    type: DataTypes.STRING,
    allowNull: false,
    validate: {
      isEmail: true
    }
  },
  otp: {
    type: DataTypes.STRING,
    allowNull: false,
    validate: {
      len: [6, 6]
    }
  },
  role: {
    type: DataTypes.ENUM('customer', 'agent', 'admin', 'agency_owner'),
    allowNull: false
  },
  expiresAt: {
    type: DataTypes.DATE,
    allowNull: false
  },
  isUsed: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  }
}, {
  tableName: 'login_otps',
  timestamps: true
});

module.exports = LoginOTP;
