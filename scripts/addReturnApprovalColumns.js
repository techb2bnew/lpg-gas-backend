require('dotenv').config();
const { sequelize } = require('../config/database');

async function addReturnApprovalColumns() {
  try {
    console.log('🔄 Connecting to database...');
    await sequelize.authenticate();
    console.log('✅ Database connected successfully');

    console.log('🔄 Adding return approval/rejection columns to orders table...');

    // First, update the status ENUM to include return_approved and return_rejected
    console.log('🔄 Updating status ENUM...');
    try {
      await sequelize.query(`
        ALTER TYPE "enum_orders_status" 
        ADD VALUE IF NOT EXISTS 'return_approved';
      `);
      console.log('✅ Added return_approved to status ENUM');
    } catch (error) {
      if (error.message.includes('already exists')) {
        console.log('✓ return_approved already exists in status ENUM');
      } else {
        console.log('⚠️ Error adding return_approved (might already exist):', error.message);
      }
    }

    try {
      await sequelize.query(`
        ALTER TYPE "enum_orders_status" 
        ADD VALUE IF NOT EXISTS 'return_rejected';
      `);
      console.log('✅ Added return_rejected to status ENUM');
    } catch (error) {
      if (error.message.includes('already exists')) {
        console.log('✓ return_rejected already exists in status ENUM');
      } else {
        console.log('⚠️ Error adding return_rejected (might already exist):', error.message);
      }
    }

    // Check if columns already exist
    const [columns] = await sequelize.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'orders' 
      AND column_name IN (
        'return_approved_at', 
        'return_approved_by', 
        'return_approved_by_id', 
        'return_approved_by_name',
        'return_rejected_at',
        'return_rejected_by',
        'return_rejected_by_id',
        'return_rejected_by_name'
      )
    `);

    const existingColumns = columns.map(col => col.column_name);
    console.log('Existing return approval/rejection columns:', existingColumns);

    // Add return_approved_at column
    if (!existingColumns.includes('return_approved_at')) {
      console.log('Adding return_approved_at column...');
      await sequelize.query(`
        ALTER TABLE orders 
        ADD COLUMN return_approved_at TIMESTAMP NULL;
      `);
      await sequelize.query(`
        COMMENT ON COLUMN orders.return_approved_at IS 'Timestamp when return request was approved';
      `);
      console.log('✅ Added return_approved_at');
    } else {
      console.log('✓ return_approved_at already exists');
    }

    // Add return_approved_by ENUM type if it doesn't exist
    try {
      await sequelize.query(`
        CREATE TYPE "enum_orders_return_approved_by" AS ENUM ('admin', 'agency');
      `);
      console.log('✅ Created return_approved_by ENUM type');
    } catch (error) {
      if (error.message.includes('already exists')) {
        console.log('✓ return_approved_by ENUM type already exists');
      } else {
        console.log('⚠️ Error creating return_approved_by ENUM:', error.message);
      }
    }

    // Add return_approved_by column
    if (!existingColumns.includes('return_approved_by')) {
      console.log('Adding return_approved_by column...');
      await sequelize.query(`
        ALTER TABLE orders 
        ADD COLUMN return_approved_by "enum_orders_return_approved_by" NULL;
      `);
      await sequelize.query(`
        COMMENT ON COLUMN orders.return_approved_by IS 'Who approved the return request';
      `);
      console.log('✅ Added return_approved_by');
    } else {
      console.log('✓ return_approved_by already exists');
    }

    // Add return_approved_by_id column
    if (!existingColumns.includes('return_approved_by_id')) {
      console.log('Adding return_approved_by_id column...');
      await sequelize.query(`
        ALTER TABLE orders 
        ADD COLUMN return_approved_by_id UUID NULL;
      `);
      await sequelize.query(`
        COMMENT ON COLUMN orders.return_approved_by_id IS 'ID of the user who approved the return';
      `);
      console.log('✅ Added return_approved_by_id');
    } else {
      console.log('✓ return_approved_by_id already exists');
    }

    // Add return_approved_by_name column
    if (!existingColumns.includes('return_approved_by_name')) {
      console.log('Adding return_approved_by_name column...');
      await sequelize.query(`
        ALTER TABLE orders 
        ADD COLUMN return_approved_by_name VARCHAR(255) NULL;
      `);
      await sequelize.query(`
        COMMENT ON COLUMN orders.return_approved_by_name IS 'Name of the user who approved the return';
      `);
      console.log('✅ Added return_approved_by_name');
    } else {
      console.log('✓ return_approved_by_name already exists');
    }

    // Add return_rejected_at column
    if (!existingColumns.includes('return_rejected_at')) {
      console.log('Adding return_rejected_at column...');
      await sequelize.query(`
        ALTER TABLE orders 
        ADD COLUMN return_rejected_at TIMESTAMP NULL;
      `);
      await sequelize.query(`
        COMMENT ON COLUMN orders.return_rejected_at IS 'Timestamp when return request was rejected';
      `);
      console.log('✅ Added return_rejected_at');
    } else {
      console.log('✓ return_rejected_at already exists');
    }

    // Add return_rejected_by ENUM type if it doesn't exist
    try {
      await sequelize.query(`
        CREATE TYPE "enum_orders_return_rejected_by" AS ENUM ('admin', 'agency');
      `);
      console.log('✅ Created return_rejected_by ENUM type');
    } catch (error) {
      if (error.message.includes('already exists')) {
        console.log('✓ return_rejected_by ENUM type already exists');
      } else {
        console.log('⚠️ Error creating return_rejected_by ENUM:', error.message);
      }
    }

    // Add return_rejected_by column
    if (!existingColumns.includes('return_rejected_by')) {
      console.log('Adding return_rejected_by column...');
      await sequelize.query(`
        ALTER TABLE orders 
        ADD COLUMN return_rejected_by "enum_orders_return_rejected_by" NULL;
      `);
      await sequelize.query(`
        COMMENT ON COLUMN orders.return_rejected_by IS 'Who rejected the return request';
      `);
      console.log('✅ Added return_rejected_by');
    } else {
      console.log('✓ return_rejected_by already exists');
    }

    // Add return_rejected_by_id column
    if (!existingColumns.includes('return_rejected_by_id')) {
      console.log('Adding return_rejected_by_id column...');
      await sequelize.query(`
        ALTER TABLE orders 
        ADD COLUMN return_rejected_by_id UUID NULL;
      `);
      await sequelize.query(`
        COMMENT ON COLUMN orders.return_rejected_by_id IS 'ID of the user who rejected the return';
      `);
      console.log('✅ Added return_rejected_by_id');
    } else {
      console.log('✓ return_rejected_by_id already exists');
    }

    // Add return_rejected_by_name column
    if (!existingColumns.includes('return_rejected_by_name')) {
      console.log('Adding return_rejected_by_name column...');
      await sequelize.query(`
        ALTER TABLE orders 
        ADD COLUMN return_rejected_by_name VARCHAR(255) NULL;
      `);
      await sequelize.query(`
        COMMENT ON COLUMN orders.return_rejected_by_name IS 'Name of the user who rejected the return';
      `);
      console.log('✅ Added return_rejected_by_name');
    } else {
      console.log('✓ return_rejected_by_name already exists');
    }

    console.log('✅ Return approval/rejection columns added successfully!');

    // Verify columns
    const [result] = await sequelize.query(`
      SELECT column_name, data_type, column_default
      FROM information_schema.columns 
      WHERE table_name = 'orders' 
      AND column_name IN (
        'return_approved_at', 
        'return_approved_by', 
        'return_approved_by_id', 
        'return_approved_by_name',
        'return_rejected_at',
        'return_rejected_by',
        'return_rejected_by_id',
        'return_rejected_by_name'
      )
      ORDER BY column_name;
    `);

    console.log('\n📋 Return approval/rejection columns in orders table:');
    console.table(result);

    await sequelize.close();
    console.log('✅ Database connection closed');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error adding return approval/rejection columns:', error);
    await sequelize.close();
    process.exit(1);
  }
}

addReturnApprovalColumns();
