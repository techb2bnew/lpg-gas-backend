const { DataTypes } = require('sequelize');
const bcrypt = require('bcryptjs');
const { sequelize } = require('../config/database');

const User = sequelize.define('User', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  name: {
    type: DataTypes.STRING,
    allowNull: true, // Initially null, filled during profile registration
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
    allowNull: true, // Initially null, filled during profile registration
    validate: {
      len: [10, 15]
    }
  },
  password: {
    type: DataTypes.STRING,
    allowNull: true, // No password for OTP-based login
    validate: {
      len: [6, 100]
    }
  },
  role: {
    type: DataTypes.ENUM('admin', 'customer', 'agent'),
    defaultValue: 'customer'
  },
  profileImage: {
    type: DataTypes.STRING,
    allowNull: true
  },
  // Additional fields for customer/agent
  address: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  // Multiple addresses support
  addresses: {
    type: DataTypes.JSONB,
    allowNull: true,
    defaultValue: []
  },
  // For agent - link to delivery agent table
  deliveryAgentId: {
    type: DataTypes.UUID,
    allowNull: true,
    references: {
      model: 'delivery_agents',
      key: 'id'
    }
  },
  // Profile completion status
  isProfileComplete: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  },
  // Registration date (when profile is completed)
  registeredAt: {
    type: DataTypes.DATE,
    allowNull: true
  },
  // Admin can block a user from logging in
  isBlocked: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  }
}, {
  tableName: 'users',
  hooks: {
    beforeCreate: async (user) => {
      if (user.password) {
        user.password = await bcrypt.hash(user.password, 12);
      }
    },
    beforeUpdate: async (user) => {
      if (user.changed('password')) {
        user.password = await bcrypt.hash(user.password, 12);
      }
    }
  }
});

// Instance method to compare password
User.prototype.comparePassword = async function(candidatePassword) {
  if (!this.password) return false;
  return await bcrypt.compare(candidatePassword, this.password);
};

// Instance method to get public profile
User.prototype.toPublicJSON = function() {
  const user = this.toJSON();
  delete user.password;
  return user;
};

module.exports = User;
