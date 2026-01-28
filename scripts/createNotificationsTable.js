const { sequelize } = require('../config/database');
const { Notification } = require('../models');

async function createNotificationsTable() {
  try {
    console.log('🔄 Creating notifications table...');
    
    // Use alter: true to add the table if it doesn't exist without dropping existing data
    await Notification.sync({ alter: true });
    
    console.log('✅ Notifications table created/updated successfully!');
    
    // Verify table exists
    const [results] = await sequelize.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_name = 'notifications'
    `);
    
    if (results.length > 0) {
      console.log('✅ Verified: notifications table exists in database');
    } else {
      console.log('⚠️ Warning: notifications table not found after sync');
    }
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Error creating notifications table:', error);
    process.exit(1);
  }
}

// Run if this file is executed directly
if (require.main === module) {
  createNotificationsTable();
}

module.exports = createNotificationsTable;

