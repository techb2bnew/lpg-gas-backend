const { sequelize } = require('../config/database');
const DeliveryCharge = require('../models/DeliveryCharge');
require('dotenv').config();

const syncDeliveryCharges = async () => {
  try {
    console.log('Connecting to database...');
    await sequelize.authenticate();
    console.log('Database connection established.');

    console.log('Syncing DeliveryCharge model...');
    await DeliveryCharge.sync({ alter: true });
    console.log('DeliveryCharge table synced successfully!');

    process.exit(0);
  } catch (error) {
    console.error('Error syncing DeliveryCharge table:', error);
    process.exit(1);
  }
};

syncDeliveryCharges();

