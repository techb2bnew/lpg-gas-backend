const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const PlatformCharge = sequelize.define('PlatformCharge', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },
  amount: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: false,
    validate: {
      min: 0,
    },
  },
  isActive: {
    type: DataTypes.BOOLEAN,
    defaultValue: true,
  },
}, {
  tableName: 'platform_charges',
  timestamps: true,
});

module.exports = PlatformCharge;
