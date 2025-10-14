const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const AgencyInventory = sequelize.define('AgencyInventory', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  productId: {
    type: DataTypes.UUID,
    allowNull: false,
    field: 'product_id',
    references: {
      model: 'products',
      key: 'id'
    }
  },
  agencyId: {
    type: DataTypes.UUID,
    allowNull: false,
    field: 'agency_id',
    references: {
      model: 'agencies',
      key: 'id'
    }
  },
  stock: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0,
    validate: {
      min: 0
    }
  },
  lowStockThreshold: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 10,
    field: 'low_stock_threshold',
    validate: {
      min: 0
    }
  },
  isActive: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: true,
    field: 'is_active'
  },
  agencyPrice: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: true,
    field: 'agency_price',
    validate: {
      min: 0
    }
  },
  agencyVariants: {
    // Array of { label: '3kg', unit: 'kg', price: 100.00, stock: 5 }
    type: DataTypes.JSONB,
    allowNull: true,
    defaultValue: [],
    field: 'agency_variants'
  }
}, {
  tableName: 'agency_inventory',
  timestamps: true,
  indexes: [
    {
      unique: true,
      fields: ['product_id', 'agency_id']
    }
  ]
});

module.exports = AgencyInventory;
