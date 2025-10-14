const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const Coupon = sequelize.define('Coupon', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true,
  },
  code: {
    type: DataTypes.STRING,
    allowNull: false,
    unique: true,
    validate: {
      notEmpty: true,
    },
  },
  discountType: {
    type: DataTypes.ENUM('percentage', 'fixed'),
    allowNull: false,
    field: 'discount_type',
  },
  discountValue: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: false,
    validate: {
      min: 0,
    },
    field: 'discount_value',
  },
  minAmount: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: false,
    defaultValue: 0,
    validate: {
      min: 0,
    },
    field: 'min_amount',
  },
  maxAmount: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: true,
    validate: {
      min: 0,
    },
    field: 'max_amount',
  },
  expiryDate: {
    type: DataTypes.DATEONLY,
    allowNull: false,
    field: 'expiry_date',
  },
  expiryTime: {
    type: DataTypes.STRING,
    allowNull: false,
    validate: {
      notEmpty: true,
    },
    field: 'expiry_time',
  },
  agencyId: {
    type: DataTypes.UUID,
    allowNull: false,
    references: {
      model: 'agencies',
      key: 'id',
    },
    field: 'agency_id',
  },
  isActive: {
    type: DataTypes.BOOLEAN,
    defaultValue: true,
    field: 'is_active',
  },
}, {
  tableName: 'coupons',
  timestamps: true,
  validate: {
    // Ensure only one discount type is valid
    validDiscountValue() {
      if (this.discountType === 'percentage' && this.discountValue > 100) {
        throw new Error('Percentage discount cannot exceed 100%');
      }
    },
    validAmountRange() {
      if (this.maxAmount !== null && this.maxAmount !== undefined && parseFloat(this.maxAmount) < parseFloat(this.minAmount)) {
        throw new Error('Maximum amount must be greater than minimum amount');
      }
    },
  },
});

module.exports = Coupon;
