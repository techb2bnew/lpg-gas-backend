require('dotenv').config();
const { sequelize } = require('../config/database');

async function addReorderColumns() {
  try {
    console.log('🔄 Connecting to database...');
    await sequelize.authenticate();
    console.log('✅ Database connected successfully');

    console.log('🔄 Adding reorder columns to orders table...');

    // Check if columns already exist
    const [columns] = await sequelize.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'orders' 
      AND column_name IN ('reorderedAt')
    `);

    const existingColumns = columns.map(col => col.column_name);
    console.log('Existing reorder columns:', existingColumns);

    // Add reorderedAt column
    if (!existingColumns.includes('reorderedAt')) {
      console.log('Adding reorderedAt column...');
      await sequelize.query(`
        ALTER TABLE orders 
        ADD COLUMN "reorderedAt" TIMESTAMP NULL;
      `);

      await sequelize.query(`
        COMMENT ON COLUMN orders."reorderedAt" IS 'Timestamp when order was reordered (reactivated from cancelled/returned)';
      `);
    } else {
      console.log('✓ reorderedAt column already exists');
    }

    console.log('✅ Reorder columns added successfully!');

    // Verify columns
    const [result] = await sequelize.query(`
      SELECT column_name, data_type, column_default
      FROM information_schema.columns 
      WHERE table_name = 'orders' 
      AND column_name IN ('reorderedAt')
      ORDER BY column_name;
    `);

    console.log('\n📋 Reorder columns in orders table:');
    console.table(result);

    await sequelize.close();
    console.log('✅ Database connection closed');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error adding reorder columns:', error);
    await sequelize.close();
    process.exit(1);
  }
}

addReorderColumns();

