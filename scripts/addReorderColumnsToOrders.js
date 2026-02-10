require('dotenv').config();
const { sequelize } = require('../config/database');

async function addReorderColumns() {
  try {
    console.log('🔄 Connecting to database...');
    await sequelize.authenticate();
    console.log('✅ Database connected successfully');

    console.log('🔄 Adding reorder columns to orders table...');

    // Check if columns already exist (handle both old and correct names safely)
    const [columns] = await sequelize.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'orders' 
      AND column_name IN ('reordered_at', 'reorderedAt')
    `);

    const existingColumns = columns.map(col => col.column_name);
    console.log('Existing reorder-related columns:', existingColumns);

    const hasSnakeCase = existingColumns.includes('reordered_at');
    const hasCamelCase = existingColumns.includes('reorderedAt');

    if (!hasSnakeCase && hasCamelCase) {
      // If old camelCase column exists in DB, rename it to the correct snake_case
      console.log('Renaming column "reorderedAt" -> "reordered_at"...');
      await sequelize.query(`
        ALTER TABLE orders 
        RENAME COLUMN "reorderedAt" TO reordered_at;
      `);

      await sequelize.query(`
        COMMENT ON COLUMN orders.reordered_at IS 'Timestamp when order was reordered (reactivated from cancelled/returned)';
      `);
    } else if (!hasSnakeCase && !hasCamelCase) {
      // Fresh DB: add the correct snake_case column
      console.log('Adding reordered_at column...');
      await sequelize.query(`
        ALTER TABLE orders 
        ADD COLUMN reordered_at TIMESTAMP NULL;
      `);

      await sequelize.query(`
        COMMENT ON COLUMN orders.reordered_at IS 'Timestamp when order was reordered (reactivated from cancelled/returned)';
      `);
    } else {
      console.log('✓ Reorder tracking column already exists (reordered_at)');
    }

    console.log('✅ Reorder columns added successfully!');

    // Verify columns
    const [result] = await sequelize.query(`
      SELECT column_name, data_type, column_default
      FROM information_schema.columns 
      WHERE table_name = 'orders' 
      AND column_name IN ('reordered_at')
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

