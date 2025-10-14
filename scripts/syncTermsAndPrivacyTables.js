const { sequelize } = require('../config/database');
const { TermsAndConditions, PrivacyPolicy } = require('../models');

async function syncTermsAndPrivacyTables() {
  try {
    console.log('Starting database sync for Terms & Conditions and Privacy Policy tables...');
    
    // Sync Terms & Conditions table
    await TermsAndConditions.sync({ force: false });
    console.log('✅ Terms & Conditions table synced successfully');
    
    // Sync Privacy Policy table
    await PrivacyPolicy.sync({ force: false });
    console.log('✅ Privacy Policy table synced successfully');
    
    console.log('🎉 All tables synced successfully!');
    
    // Close the database connection
    await sequelize.close();
    console.log('Database connection closed.');
    
  } catch (error) {
    console.error('❌ Error syncing tables:', error);
    process.exit(1);
  }
}

// Run the sync function
syncTermsAndPrivacyTables();
