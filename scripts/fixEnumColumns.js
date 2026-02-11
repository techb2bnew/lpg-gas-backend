const { sequelize } = require('../config/database');

async function fixEnumColumns() {
  try {
    console.log('🔧 Fixing ENUM columns in orders table...');
    
    // Check if orders table exists
    const [tableExists] = await sequelize.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_name = 'orders'
      );
    `);
    
    if (!tableExists[0].exists) {
      console.log('⚠️  Orders table does not exist. Run syncDatabase.js first.');
      process.exit(0);
    }
    
    // Fix return_approved_by column
    console.log('📋 Checking return_approved_by column...');
    const [approvedCol] = await sequelize.query(`
      SELECT column_name, data_type, udt_name
      FROM information_schema.columns 
      WHERE table_name = 'orders' 
      AND column_name = 'return_approved_by'
    `);
    
    if (approvedCol.length > 0) {
      const col = approvedCol[0];
      console.log(`   Found column: ${col.column_name}, Type: ${col.data_type}, UDT: ${col.udt_name}`);
      
      // If it's not an ENUM (USER-DEFINED), drop and recreate
      if (col.data_type !== 'USER-DEFINED' || !col.udt_name.includes('enum')) {
        console.log('   ⚠️  Column is not ENUM type. Dropping and recreating...');
        
        // Drop the column
        await sequelize.query(`
          ALTER TABLE "orders" DROP COLUMN IF EXISTS "return_approved_by" CASCADE;
        `);
        console.log('   ✅ Column dropped');
        
        // Create ENUM type if it doesn't exist
        await sequelize.query(`
          DO $$ 
          BEGIN
            IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'enum_orders_return_approved_by') THEN
              CREATE TYPE "enum_orders_return_approved_by" AS ENUM('admin', 'agency');
            END IF;
          END $$;
        `);
        console.log('   ✅ ENUM type created');
        
        // Add the column back with ENUM type
        await sequelize.query(`
          ALTER TABLE "orders" 
          ADD COLUMN "return_approved_by" "enum_orders_return_approved_by" NULL;
        `);
        console.log('   ✅ Column recreated with ENUM type');
      } else {
        console.log('   ✅ Column is already ENUM type');
      }
    } else {
      console.log('   ℹ️  Column does not exist (will be created by sync)');
    }
    
    // Fix return_rejected_by column
    console.log('📋 Checking return_rejected_by column...');
    const [rejectedCol] = await sequelize.query(`
      SELECT column_name, data_type, udt_name
      FROM information_schema.columns 
      WHERE table_name = 'orders' 
      AND column_name = 'return_rejected_by'
    `);
    
    if (rejectedCol.length > 0) {
      const col = rejectedCol[0];
      console.log(`   Found column: ${col.column_name}, Type: ${col.data_type}, UDT: ${col.udt_name}`);
      
      if (col.data_type !== 'USER-DEFINED' || !col.udt_name.includes('enum')) {
        console.log('   ⚠️  Column is not ENUM type. Dropping and recreating...');
        
        await sequelize.query(`
          ALTER TABLE "orders" DROP COLUMN IF EXISTS "return_rejected_by" CASCADE;
        `);
        console.log('   ✅ Column dropped');
        
        await sequelize.query(`
          DO $$ 
          BEGIN
            IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'enum_orders_return_rejected_by') THEN
              CREATE TYPE "enum_orders_return_rejected_by" AS ENUM('admin', 'agency');
            END IF;
          END $$;
        `);
        console.log('   ✅ ENUM type created');
        
        await sequelize.query(`
          ALTER TABLE "orders" 
          ADD COLUMN "return_rejected_by" "enum_orders_return_rejected_by" NULL;
        `);
        console.log('   ✅ Column recreated with ENUM type');
      } else {
        console.log('   ✅ Column is already ENUM type');
      }
    } else {
      console.log('   ℹ️  Column does not exist (will be created by sync)');
    }
    
    console.log('✅ ENUM columns fixed successfully!');
    console.log('💡 Now you can run: node scripts/syncDatabase.js');
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Failed to fix ENUM columns:', error);
    console.error('Error details:', error.message);
    if (error.sql) {
      console.error('SQL:', error.sql);
    }
    process.exit(1);
  }
}

// Run if this file is executed directly
if (require.main === module) {
  fixEnumColumns();
}

module.exports = fixEnumColumns;
