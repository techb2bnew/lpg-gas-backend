const { sequelize } = require('../config/database');
const { User, Product, DeliveryAgent, Order, LoginOTP, Notification, Agency, AgencyInventory, AgencyOwner, TermsAndConditions, PrivacyPolicy, Category, Tax, PlatformCharge, Coupon, DeliveryCharge, Banner } = require('../models');

async function syncDatabaseSafe() {
  try {
    console.log('🔄 Starting safe database synchronization...');
    
    // First, check if orders table exists and has return_approved_by column
    const [results] = await sequelize.query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'orders' 
      AND column_name = 'return_approved_by'
    `);
    
    if (results.length > 0) {
      console.log('⚠️  Found existing return_approved_by column. Fixing ENUM type...');
      
      // Check current data type
      const currentType = results[0].data_type;
      console.log(`   Current type: ${currentType}`);
      
      // If it's not already an ENUM, we need to convert it
      if (currentType !== 'USER-DEFINED') {
        console.log('   Converting column to ENUM type...');
        
        // Step 1: Drop the column if it exists (only if it's not ENUM)
        await sequelize.query(`
          ALTER TABLE "orders" 
          DROP COLUMN IF EXISTS "return_approved_by" CASCADE;
        `);
        
        console.log('   ✅ Column dropped');
      }
    }
    
    // Same for return_rejected_by
    const [rejectedResults] = await sequelize.query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'orders' 
      AND column_name = 'return_rejected_by'
    `);
    
    if (rejectedResults.length > 0) {
      const currentType = rejectedResults[0].data_type;
      if (currentType !== 'USER-DEFINED') {
        console.log('   Converting return_rejected_by column to ENUM type...');
        await sequelize.query(`
          ALTER TABLE "orders" 
          DROP COLUMN IF EXISTS "return_rejected_by" CASCADE;
        `);
        console.log('   ✅ Column dropped');
      }
    }
    
    // Now sync with alter mode (safer - won't drop existing data)
    console.log('🔄 Syncing database with alter mode...');
    await sequelize.sync({ alter: true });
    
    console.log('✅ Database synchronized successfully!');
    console.log('📋 Tables synced:');
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
    console.error('Error details:', error.message);
    if (error.sql) {
      console.error('SQL:', error.sql);
    }
    process.exit(1);
  }
}

// Run if this file is executed directly
if (require.main === module) {
  syncDatabaseSafe();
}

module.exports = syncDatabaseSafe;
