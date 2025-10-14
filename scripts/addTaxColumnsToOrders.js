require('dotenv').config();
const { sequelize } = require('../config/database');

async function addTaxColumns() {
  try {
    console.log('🔄 Connecting to database...');
    await sequelize.authenticate();
    console.log('✅ Database connected successfully');

    console.log('🔄 Adding tax columns to orders table...');

    // Check if columns already exist
    const [columns] = await sequelize.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'orders' 
      AND column_name IN ('tax_type', 'tax_value', 'tax_amount')
    `);

    const existingColumns = columns.map(col => col.column_name);
    console.log('Existing tax columns:', existingColumns);

    // Create ENUM type if it doesn't exist
    if (!existingColumns.includes('tax_type')) {
      console.log('Creating enum_orders_tax_type...');
      await sequelize.query(`
        DO $$ BEGIN
          CREATE TYPE enum_orders_tax_type AS ENUM ('none', 'percentage', 'fixed');
        EXCEPTION
          WHEN duplicate_object THEN null;
        END $$;
      `);

      console.log('Adding tax_type column...');
      await sequelize.query(`
        ALTER TABLE orders 
        ADD COLUMN tax_type enum_orders_tax_type DEFAULT 'none';
      `);
      
      await sequelize.query(`
        COMMENT ON COLUMN orders.tax_type IS 'Type of tax applied';
      `);
    } else {
      console.log('✓ tax_type column already exists');
    }

    // Add tax_value column
    if (!existingColumns.includes('tax_value')) {
      console.log('Adding tax_value column...');
      await sequelize.query(`
        ALTER TABLE orders 
        ADD COLUMN tax_value DECIMAL(10,2) DEFAULT 0;
      `);
      
      await sequelize.query(`
        COMMENT ON COLUMN orders.tax_value IS 'Tax percentage or fixed amount value';
      `);
    } else {
      console.log('✓ tax_value column already exists');
    }

    // Add tax_amount column
    if (!existingColumns.includes('tax_amount')) {
      console.log('Adding tax_amount column...');
      await sequelize.query(`
        ALTER TABLE orders 
        ADD COLUMN tax_amount DECIMAL(10,2) DEFAULT 0 CHECK (tax_amount >= 0);
      `);
      
      await sequelize.query(`
        COMMENT ON COLUMN orders.tax_amount IS 'Calculated tax amount';
      `);
    } else {
      console.log('✓ tax_amount column already exists');
    }

    console.log('✅ Tax columns added successfully!');

    // Verify columns
    const [result] = await sequelize.query(`
      SELECT column_name, data_type, column_default
      FROM information_schema.columns 
      WHERE table_name = 'orders' 
      AND column_name IN ('tax_type', 'tax_value', 'tax_amount')
      ORDER BY column_name;
    `);

    console.log('\n📋 Tax columns in orders table:');
    console.table(result);

    await sequelize.close();
    console.log('✅ Database connection closed');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error adding tax columns:', error);
    await sequelize.close();
    process.exit(1);
  }
}

addTaxColumns();
