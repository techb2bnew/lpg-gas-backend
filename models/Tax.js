const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const Tax = sequelize.define('Tax', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },
  percentage: {
    type: DataTypes.DECIMAL(5, 2),
    allowNull: true,
    defaultValue: null,
    validate: {
      min: 0,
      max: 100,
    },
    comment: 'Tax percentage (0-100)',
  },
  fixedAmount: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: true,
    defaultValue: null,
    validate: {
      min: 0,
    },
    comment: 'Fixed tax amount',
  },
  isActive: {
    type: DataTypes.BOOLEAN,
    defaultValue: true,
  },
}, {
  tableName: 'taxes',
  timestamps: true,
  validate: {
    // Ensure only one field is set at a time
    eitherPercentageOrFixed() {
      if (this.percentage !== null && this.fixedAmount !== null) {
        throw new Error('Only one of percentage or fixedAmount can be set at a time');
      }
    },
  },
});

module.exports = Tax;
