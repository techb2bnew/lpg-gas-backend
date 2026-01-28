const { sequelize } = require('../config/database');

async function migrateBanner() {
  try {
    console.log('Starting banner migration...');
    
    // Drop and recreate the images column as JSONB
    await sequelize.query(`
      ALTER TABLE banners DROP COLUMN IF EXISTS images;
    `);
    console.log('Dropped old images column');
    
    await sequelize.query(`
      ALTER TABLE banners ADD COLUMN images JSONB NOT NULL DEFAULT '[]';
    `);
    console.log('Created new images column as JSONB');
    
    console.log('Migration completed successfully!');
    process.exit(0);
  } catch (error) {
    console.error('Migration failed:', error.message);
    process.exit(1);
  }
}

migrateBanner();

