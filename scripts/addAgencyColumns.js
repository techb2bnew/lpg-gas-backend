const { sequelize } = require('../config/database');

async function addAgencyColumns() {
  try {
    console.log('🔄 Adding agency columns to database...');

    // Add agencyId column to products table
    console.log('Adding agencyId to products table...');
    await sequelize.query(`
      ALTER TABLE products 
      ADD COLUMN IF NOT EXISTS agency_id UUID REFERENCES agencies(id)
    `);

    // Add agencyId column to delivery_agents table
    console.log('Adding agencyId to delivery_agents table...');
    await sequelize.query(`
      ALTER TABLE delivery_agents 
      ADD COLUMN IF NOT EXISTS agency_id UUID REFERENCES agencies(id)
    `);

    // Add agencyId column to orders table
    console.log('Adding agencyId to orders table...');
    await sequelize.query(`
      ALTER TABLE orders 
      ADD COLUMN IF NOT EXISTS agency_id UUID REFERENCES agencies(id)
    `);

    console.log('✅ All agency columns added successfully!');

    // Show the updated table structures
    console.log('\n📋 Updated table structures:');
    
    const productsColumns = await sequelize.query(`
      SELECT column_name, data_type, is_nullable 
      FROM information_schema.columns 
      WHERE table_name = 'products' 
      AND column_name LIKE '%agency%'
      ORDER BY column_name
    `);
    console.log('Products table agency columns:', productsColumns[0]);

    const deliveryAgentsColumns = await sequelize.query(`
      SELECT column_name, data_type, is_nullable 
      FROM information_schema.columns 
      WHERE table_name = 'delivery_agents' 
      AND column_name LIKE '%agency%'
      ORDER BY column_name
    `);
    console.log('Delivery agents table agency columns:', deliveryAgentsColumns[0]);

    const ordersColumns = await sequelize.query(`
      SELECT column_name, data_type, is_nullable 
      FROM information_schema.columns 
      WHERE table_name = 'orders' 
      AND column_name LIKE '%agency%'
      ORDER BY column_name
    `);
    console.log('Orders table agency columns:', ordersColumns[0]);

  } catch (error) {
    console.error('❌ Error adding agency columns:', error.message);
    throw error;
  } finally {
    await sequelize.close();
  }
}

// Run the migration
addAgencyColumns();
