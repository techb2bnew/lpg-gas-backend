const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const Product = sequelize.define('Product', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  productName: {
    type: DataTypes.STRING,
    allowNull: false,
    validate: {
      len: [2, 200]
    }
  },
  unit: {
    type: DataTypes.STRING,
    allowNull: true,
    validate: {
      len: [1, 50]
    }
  },
  description: {
    type: DataTypes.TEXT,
    allowNull: false,
    validate: {
      len: [3, 2000]
    }
  },
  price: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: true,
    validate: {
      min: 0
    }
  },
  // Removed stock - agencies will manage their own stock
  lowStockThreshold: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 10,
    validate: {
      min: 0
    }
  },
  category: {
    type: DataTypes.STRING,
    allowNull: false,
    defaultValue: 'lpg',
    validate: {
      len: [2, 100]
    }
  },
  status: {
    type: DataTypes.ENUM('active', 'inactive'),
    defaultValue: 'active'
  },
  variants: {
    // Array of { label: '3kg', unit: 'kg', price: 100.00, stock: 5 }
    type: DataTypes.JSONB,
    allowNull: true,
    defaultValue: []
  },
  images: {
    // Array of image path strings (Cloudinary URLs). Use TEXT[] to avoid 255-char limit
    type: DataTypes.ARRAY(DataTypes.TEXT),
    allowNull: true,
    defaultValue: []
  },
  tags: {
    // Array of tag strings like ["tag1", "tag2", "tag3"]
    type: DataTypes.ARRAY(DataTypes.STRING),
    allowNull: true,
    defaultValue: []
  }
  // Removed agencyId - products are now admin-managed
  // Removed agencies - agency inventory is now tracked separately
}, {
  tableName: 'products',
  timestamps: true
});

module.exports = Product;
