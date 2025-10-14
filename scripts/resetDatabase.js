const { sequelize } = require('../config/database');

async function resetDatabase() {
  try {
    console.log('🔄 Resetting database...');
    
    // Drop all tables
    await sequelize.drop();
    console.log('✅ All tables dropped');
    
    // Sync all models (create tables)
    await sequelize.sync({ force: true });
    console.log('✅ All tables recreated');
    
    console.log('🎉 Database reset completed successfully!');
    process.exit(0);
  } catch (error) {
    console.error('❌ Database reset failed:', error);
    process.exit(1);
  }
}

// Run if this file is executed directly
if (require.main === module) {
  resetDatabase();
}

module.exports = resetDatabase;
