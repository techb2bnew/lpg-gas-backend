require('dotenv').config();
const { sequelize } = require('../config/database');

async function addCouponColumns() {
  try {
    console.log('🔄 Connecting to database...');
    await sequelize.authenticate();
    console.log('✅ Database connected successfully');

    console.log('🔄 Adding coupon columns to orders table...');

    // Check if columns already exist
    const [columns] = await sequelize.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'orders' 
      AND column_name IN ('coupon_code', 'coupon_discount')
    `);

    const existingColumns = columns.map(col => col.column_name);
    console.log('Existing coupon columns:', existingColumns);

    // Add coupon_code column
    if (!existingColumns.includes('coupon_code')) {
      console.log('Adding coupon_code column...');
      await sequelize.query(`
        ALTER TABLE orders 
        ADD COLUMN coupon_code VARCHAR(255) DEFAULT NULL;
      `);
      
      await sequelize.query(`
        COMMENT ON COLUMN orders.coupon_code IS 'Applied coupon code';
      `);
    } else {
      console.log('✓ coupon_code column already exists');
    }

    // Add coupon_discount column
    if (!existingColumns.includes('coupon_discount')) {
      console.log('Adding coupon_discount column...');
      await sequelize.query(`
        ALTER TABLE orders 
        ADD COLUMN coupon_discount DECIMAL(10,2) DEFAULT 0 CHECK (coupon_discount >= 0);
      `);
      
      await sequelize.query(`
        COMMENT ON COLUMN orders.coupon_discount IS 'Coupon discount amount';
      `);
    } else {
      console.log('✓ coupon_discount column already exists');
    }

    console.log('✅ Coupon columns added successfully!');

    // Verify columns
    const [result] = await sequelize.query(`
      SELECT column_name, data_type, column_default
      FROM information_schema.columns 
      WHERE table_name = 'orders' 
      AND column_name IN ('coupon_code', 'coupon_discount')
      ORDER BY column_name;
    `);

    console.log('\n📋 Coupon columns in orders table:');
    console.table(result);

    await sequelize.close();
    console.log('✅ Database connection closed');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error adding coupon columns:', error);
    await sequelize.close();
    process.exit(1);
  }
}

addCouponColumns();
