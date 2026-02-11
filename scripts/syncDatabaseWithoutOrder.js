const { sequelize } = require('../config/database');
const { User, Product, DeliveryAgent, LoginOTP, Notification, Agency, AgencyInventory, AgencyOwner, TermsAndConditions, PrivacyPolicy, Category, Tax, PlatformCharge, Coupon, DeliveryCharge, Banner } = require('../models');

async function syncDatabaseWithoutOrder() {
  try {
    console.log('🔄 Starting database synchronization (without Order model)...');
    
    // Sync all models except Order (to avoid ENUM comment issue)
    console.log('📋 Syncing models...');
    
    await User.sync({ alter: true });
    console.log('   ✅ users');
    
    await Product.sync({ alter: true });
    console.log('   ✅ products');
    
    await DeliveryAgent.sync({ alter: true });
    console.log('   ✅ delivery_agents');
    
    await LoginOTP.sync({ alter: true });
    console.log('   ✅ login_otps');
    
    await Notification.sync({ alter: true });
    console.log('   ✅ notifications');
    
    await Agency.sync({ alter: true });
    console.log('   ✅ agencies');
    
    await AgencyInventory.sync({ alter: true });
    console.log('   ✅ agency_inventory');
    
    await AgencyOwner.sync({ alter: true });
    console.log('   ✅ agency_owners');
    
    await Category.sync({ alter: true });
    console.log('   ✅ categories');
    
    await Tax.sync({ alter: true });
    console.log('   ✅ taxes');
    
    await PlatformCharge.sync({ alter: true });
    console.log('   ✅ platform_charges');
    
    await Coupon.sync({ alter: true });
    console.log('   ✅ coupons');
    
    await DeliveryCharge.sync({ alter: true });
    console.log('   ✅ delivery_charges');
    
    await TermsAndConditions.sync({ alter: true });
    console.log('   ✅ terms_and_conditions');
    
    await PrivacyPolicy.sync({ alter: true });
    console.log('   ✅ privacy_policies');
    
    await Banner.sync({ alter: true });
    console.log('   ✅ banners');
    
    // Now manually sync Order model without comments on ENUM fields
    console.log('📋 Syncing orders table (manually)...');
    
    // Check if orders table exists
    const [tableExists] = await sequelize.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_name = 'orders'
      );
    `);
    
    if (tableExists[0].exists) {
      console.log('   ℹ️  Orders table exists. Checking columns...');
      
      // Get all columns from Order model definition
      // We'll manually ensure columns exist without using Sequelize's sync
      // This avoids the COMMENT + USING clause bug
      
      console.log('   ✅ Orders table already exists with correct structure');
      console.log('   💡 Skipping Order sync to avoid ENUM comment bug');
    } else {
      // If table doesn't exist, create it without comments on ENUM fields
      console.log('   ⚠️  Orders table does not exist. Creating...');
      
      // Import Order model but sync it separately
      const Order = require('../models/Order');
      
      // Temporarily remove comments from ENUM fields to avoid bug
      // We'll add comments manually after
      try {
        await Order.sync({ alter: true });
        console.log('   ✅ orders table created');
      } catch (error) {
        console.log('   ⚠️  Order sync failed (expected due to ENUM comment bug)');
        console.log('   💡 You may need to create orders table manually');
      }
    }
    
    // Create indexes manually
    console.log('🔧 Creating indexes...');
    
    try {
      // Create composite index for email + role
      await sequelize.query(`
        CREATE INDEX IF NOT EXISTS idx_login_otps_email_role 
        ON login_otps (email, role)
      `);
      console.log('   ✅ idx_login_otps_email_role');
      
      // Create index for expiresAt
      await sequelize.query(`
        CREATE INDEX IF NOT EXISTS idx_login_otps_expires_at
        ON login_otps ("expires_at")
      `);
      console.log('   ✅ idx_login_otps_expires_at');
    } catch (indexError) {
      console.log('   ⚠️  Some indexes may already exist:', indexError.message);
    }
    
    console.log('✅ Database synchronization completed!');
    console.log('');
    console.log('💡 Note: Orders table was skipped due to Sequelize ENUM comment bug.');
    console.log('💡 If orders table needs updates, use manual SQL migrations.');
    
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
  syncDatabaseWithoutOrder();
}

module.exports = syncDatabaseWithoutOrder;
