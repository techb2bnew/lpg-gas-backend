const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const DeliveryAgent = sequelize.define('DeliveryAgent', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  name: {
    type: DataTypes.STRING,
    allowNull: false,
    validate: {
      len: [2, 100]
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
    unique: true,
    validate: {
      len: [10, 15]
    }
  },
  vehicleNumber: {
    type: DataTypes.STRING,
    allowNull: false,
    unique: true,
    validate: {
      len: [5, 20]
    }
  },
  drivingLicence: {
    type: DataTypes.STRING,
    allowNull: false,
    unique: true,
    validate: {
      len: [10, 20]
    }
  },
  bankDetails: {
    type: DataTypes.TEXT,
    allowNull: false
  },
  status: {
    type: DataTypes.ENUM('online', 'offline'),
    defaultValue: 'offline'
  },
  joinedAt: {
    type: DataTypes.DATE,
    allowNull: true,
    validate: {
      isDate: true
    }
  },
  profileImage: {
    type: DataTypes.STRING,
    allowNull: true
  },
  agencyId: {
    type: DataTypes.UUID,
    allowNull: false,
    references: {
      model: 'agencies',
      key: 'id'
    }
  }
}, {
  tableName: 'delivery_agents',
  timestamps: true
});

module.exports = DeliveryAgent;
