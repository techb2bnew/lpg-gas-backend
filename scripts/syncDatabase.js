const { sequelize } = require('../config/database');
const { User, Product, DeliveryAgent, Order, LoginOTP, Notification, Agency, AgencyInventory, AgencyOwner, TermsAndConditions, PrivacyPolicy, Category, Tax, PlatformCharge, Coupon, DeliveryCharge, Banner } = require('../models');

async function syncDatabase() {
  try {
    console.log('🔄 Starting database synchronization...');
    
    // Force sync will drop and recreate tables (use with caution in production)
    // In development, this is safe
    await sequelize.sync({ force: true });
    
    console.log('✅ Database synchronized successfully!');
    console.log('📋 Tables created:');
    console.log('   - users');
    console.log('   - products');
    console.log('   - delivery_agents');
    console.log('   - orders');
    console.log('   - login_otps');
    console.log('   - notifications');
    console.log('   - agencies');
    console.log('   - agency_inventory');
    console.log('   - agency_owners');
    console.log('   - categories');
    console.log('   - taxes');
    console.log('   - platform_charges');
    console.log('   - coupons');
    console.log('   - delivery_charges');
    console.log('   - terms_and_conditions');
    console.log('   - privacy_policies');
    console.log('   - banners');
    
    // Create indexes manually after table creation
    console.log('🔧 Creating indexes...');
    
    // Create composite index for email + role
    await sequelize.query(`
      CREATE INDEX IF NOT EXISTS idx_login_otps_email_role 
      ON login_otps (email, role)
    `);
    
    // Create index for expiresAt
      await sequelize.query(`
    CREATE INDEX IF NOT EXISTS idx_login_otps_expires_at
    ON login_otps ("expires_at")
  `);
    
    console.log('✅ Indexes created successfully!');
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Database synchronization failed:', error);
    process.exit(1);
  }
}

// Run if this file is executed directly
if (require.main === module) {
  syncDatabase();
}

module.exports = syncDatabase;
