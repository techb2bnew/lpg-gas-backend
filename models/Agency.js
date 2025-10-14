const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const Agency = sequelize.define('Agency', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  name: {
    type: DataTypes.STRING,
    allowNull: false,
    validate: {
      len: [2, 150]
    }
  },
  email: {
    type: DataTypes.STRING,
    allowNull: false,
    unique: true,
    validate: {
      isEmail: true
    }
  },
  phone: {
    type: DataTypes.STRING,
    allowNull: false,
    validate: {
      len: [10, 15]
    }
  },
  addressTitle: {
    type: DataTypes.STRING,
    allowNull: false,
    validate: {
      len: [2, 50]
    }
  },
  address: {
    type: DataTypes.STRING,
    allowNull: false,
    validate: {
      len: [5, 500]
    }
  },
  city: {
    type: DataTypes.STRING,
    allowNull: false,
    validate: {
      len: [2, 50]
    }
  },
  pincode: {
    type: DataTypes.STRING,
    allowNull: false,
    validate: {
      len: [6, 6]
    }
  },
  landmark: {
    type: DataTypes.STRING,
    allowNull: true
  },
  profileImage: {
    type: DataTypes.STRING,
    allowNull: true
  },
  status: {
    type: DataTypes.ENUM('inactive', 'active'),
    defaultValue: 'inactive'
  },
  confirmationToken: {
    type: DataTypes.STRING,
    allowNull: true
  },
  confirmationExpiresAt: {
    type: DataTypes.DATE,
    allowNull: true
  },
  ownerId: {
    type: DataTypes.UUID,
    allowNull: true,
    references: {
      model: 'agency_owners',
      key: 'id'
    }
  },
  isOwnerConfirmed: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  },
  autoAcceptOrders: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  },
  pickupEnabled: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  },
  pickupSlots: {
    type: DataTypes.JSONB,
    allowNull: true,
    defaultValue: []
  }
}, {
  tableName: 'agencies',
  timestamps: true
});

module.exports = Agency;


