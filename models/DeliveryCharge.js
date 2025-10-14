const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const DeliveryCharge = sequelize.define('DeliveryCharge', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  agencyId: {
    type: DataTypes.UUID,
    allowNull: false,
    references: {
      model: 'agencies',
      key: 'id'
    },
    onDelete: 'CASCADE'
  },
  chargeType: {
    type: DataTypes.ENUM('per_km', 'fixed'),
    allowNull: false,
    validate: {
      isIn: [['per_km', 'fixed']]
    }
  },
  ratePerKm: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: true,
    defaultValue: null,
    validate: {
      min: 0
    }
  },
  fixedAmount: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: true,
    defaultValue: null,
    validate: {
      min: 0
    }
  },
  deliveryRadius: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: false,
    defaultValue: 60,
    validate: {
      min: 1
    },
    comment: 'Maximum delivery radius in kilometers'
  },
  status: {
    type: DataTypes.ENUM('active', 'inactive'),
    defaultValue: 'active'
  }
}, {
  tableName: 'delivery_charges',
  timestamps: true,
  validate: {
    checkChargeTypeValues() {
      if (this.chargeType === 'per_km' && !this.ratePerKm) {
        throw new Error('Rate per kilometer is required for per_km charge type');
      }
      if (this.chargeType === 'fixed' && !this.fixedAmount) {
        throw new Error('Fixed amount is required for fixed charge type');
      }
      if (!this.deliveryRadius || this.deliveryRadius < 1) {
        throw new Error('Delivery radius must be at least 1 km');
      }
    }
  }
});

module.exports = DeliveryCharge;

