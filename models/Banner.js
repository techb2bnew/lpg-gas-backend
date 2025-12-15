const { DataTypes, Sequelize } = require('sequelize');
const { sequelize } = require('../config/database');

const Banner = sequelize.define('Banner', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  images: {
    // Array of image objects with id and url (max 5 images)
    type: DataTypes.JSONB,
    allowNull: false,
    defaultValue: Sequelize.literal("'[]'::jsonb"),
    validate: {
      maxImages(value) {
        if (value && value.length > 5) {
          throw new Error('Maximum 5 images allowed per banner');
        }
      }
    }
  }
}, {
  tableName: 'banners',
  timestamps: true
});

module.exports = Banner;
