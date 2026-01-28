const { DataTypes } = require('sequelize');
const bcrypt = require('bcrypt');
const { sequelize } = require('../config/database');

const AgencyOwner = sequelize.define('AgencyOwner', {
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
  password: {
    type: DataTypes.STRING,
    allowNull: false,
    validate: {
      len: [6, 100]
    }
  },
  phone: {
    type: DataTypes.STRING,
    allowNull: false,
    validate: {
      len: [10, 15]
    }
  },
  agencyId: {
    type: DataTypes.UUID,
    allowNull: false,
    references: {
      model: 'agencies',
      key: 'id'
    }
  },
  isActive: {
    type: DataTypes.BOOLEAN,
    defaultValue: true
  },
  isEmailVerified: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  },
  mustChangePassword: {
    type: DataTypes.BOOLEAN,
    defaultValue: true
  },
  confirmationToken: {
    type: DataTypes.STRING,
    allowNull: true
  },
  confirmationTokenExpires: {
    type: DataTypes.DATE,
    allowNull: true
  },
  lastLoginAt: {
    type: DataTypes.DATE,
    allowNull: true
  },
  profileImage: {
    type: DataTypes.STRING,
    allowNull: true
  },
  address: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  city: {
    type: DataTypes.STRING,
    allowNull: true
  },
  pincode: {
    type: DataTypes.STRING,
    allowNull: true
  },
  state: {
    type: DataTypes.STRING,
    allowNull: true
  },
  // FCM Push Notification Token
  fcmToken: {
    type: DataTypes.STRING,
    allowNull: true
  },
  fcmDeviceType: {
    type: DataTypes.STRING,
    allowNull: true
  }
}, {
  tableName: 'agency_owners',
  hooks: {
    beforeCreate: async (agencyOwner) => {
      if (agencyOwner.password) {
        agencyOwner.password = await bcrypt.hash(agencyOwner.password, 12);
      }
    },
    beforeUpdate: async (agencyOwner) => {
      if (agencyOwner.changed('password') && !agencyOwner.password.startsWith('$2b$')) {
        // Only hash if it's not already hashed
        agencyOwner.password = await bcrypt.hash(agencyOwner.password, 12);
      }
    }
  },
  timestamps: true
});

// Instance methods
AgencyOwner.prototype.toPublicJSON = function() {
  const values = { ...this.toJSON() };
  delete values.password;
  delete values.confirmationToken;
  delete values.confirmationTokenExpires;
  return values;
};

AgencyOwner.prototype.comparePassword = async function(candidatePassword) {
  return await bcrypt.compare(candidatePassword, this.password);
};

module.exports = AgencyOwner;

