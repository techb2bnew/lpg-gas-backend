/**
 * Migration script to add FCM token columns to users, agency_owners, and delivery_agents tables
 * Run: node scripts/addFCMTokenColumns.js
 */

const { sequelize } = require('../config/database');
const logger = require('../utils/logger');

const addFCMColumns = async () => {
  try {
    console.log('Starting FCM token columns migration...');

    // Add columns to users table
    console.log('Adding FCM columns to users table...');
    await sequelize.query(`
      ALTER TABLE users 
      ADD COLUMN IF NOT EXISTS fcm_token VARCHAR(255),
      ADD COLUMN IF NOT EXISTS fcm_device_type VARCHAR(50),
      ADD COLUMN IF NOT EXISTS fcm_device_id VARCHAR(255);
    `).catch(err => {
      if (!err.message.includes('already exists')) {
        console.log('Users table columns may already exist or error:', err.message);
      }
    });

    // Add columns to agency_owners table
    console.log('Adding FCM columns to agency_owners table...');
    await sequelize.query(`
      ALTER TABLE agency_owners 
      ADD COLUMN IF NOT EXISTS fcm_token VARCHAR(255),
      ADD COLUMN IF NOT EXISTS fcm_device_type VARCHAR(50),
      ADD COLUMN IF NOT EXISTS fcm_device_id VARCHAR(255);
    `).catch(err => {
      if (!err.message.includes('already exists')) {
        console.log('Agency owners table columns may already exist or error:', err.message);
      }
    });

    // Add columns to delivery_agents table
    console.log('Adding FCM columns to delivery_agents table...');
    await sequelize.query(`
      ALTER TABLE delivery_agents 
      ADD COLUMN IF NOT EXISTS fcm_token VARCHAR(255),
      ADD COLUMN IF NOT EXISTS fcm_device_type VARCHAR(50),
      ADD COLUMN IF NOT EXISTS fcm_device_id VARCHAR(255);
    `).catch(err => {
      if (!err.message.includes('already exists')) {
        console.log('Delivery agents table columns may already exist or error:', err.message);
      }
    });

    console.log('FCM token columns migration completed successfully!');
    process.exit(0);
  } catch (error) {
    console.error('Migration failed:', error);
    process.exit(1);
  }
};

addFCMColumns();

