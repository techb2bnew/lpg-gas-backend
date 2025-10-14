const { sequelize } = require('../config/database');

async function cleanupTestData() {
  try {
    console.log('🧹 Cleaning up test data...');

    // Delete in correct order to avoid foreign key constraints
    await sequelize.query('DELETE FROM orders');
    console.log('✅ Deleted orders');

    await sequelize.query('DELETE FROM delivery_agents');
    console.log('✅ Deleted delivery agents');

    await sequelize.query('DELETE FROM products');
    console.log('✅ Deleted products');

    await sequelize.query('DELETE FROM agency_owners');
    console.log('✅ Deleted agency owners');

    await sequelize.query('DELETE FROM agencies');
    console.log('✅ Deleted agencies');

    console.log('🎉 All test data cleaned up successfully!');

  } catch (error) {
    console.error('❌ Error cleaning up test data:', error.message);
    throw error;
  } finally {
    await sequelize.close();
  }
}

// Run the cleanup
cleanupTestData();
