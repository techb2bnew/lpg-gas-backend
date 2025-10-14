const { Product, AgencyInventory, Agency } = require('../models');
const { sequelize } = require('../config/database');

async function migrateToAdminProducts() {
  try {
    console.log('🚀 Starting migration to Admin Product System...');
    
    // Sync database to create AgencyInventory table
    await sequelize.sync({ alter: true });
    console.log('✅ Database synced successfully');

    // Get all existing products
    const existingProducts = await Product.findAll();

    console.log(`📦 Found ${existingProducts.length} existing products to migrate`);

    let migratedCount = 0;
    let skippedCount = 0;

    for (const product of existingProducts) {
      if (product.agencyId) {
        try {
          // Get agency details
          const agency = await Agency.findOne({
            where: { id: product.agencyId },
            attributes: ['id', 'name']
          });

          if (agency) {
            // Check if inventory already exists
            const existingInventory = await AgencyInventory.findOne({
              where: {
                productId: product.id,
                agencyId: product.agencyId
              }
            });

            if (!existingInventory) {
              // Create agency inventory entry
              await AgencyInventory.create({
                productId: product.id,
                agencyId: product.agencyId,
                stock: 0, // Default stock - agencies will manage their own
                lowStockThreshold: product.lowStockThreshold || 10,
                agencyPrice: product.price,
                agencyVariants: product.variants || [],
                isActive: product.status === 'active'
              });

              migratedCount++;
              console.log(`✅ Migrated product: ${product.productName} -> ${agency.name}`);
            } else {
              skippedCount++;
              console.log(`⏭️  Skipped product: ${product.productName} -> ${agency.name} (already exists)`);
            }
          } else {
            console.log(`⚠️  Agency not found for product ${product.productName}, skipping...`);
          }
        } catch (error) {
          console.error(`❌ Error migrating product ${product.productName}:`, error.message);
        }
      } else {
        console.log(`⚠️  Product ${product.productName} has no agency association, skipping...`);
      }
    }

    console.log('\n📊 Migration Summary:');
    console.log(`✅ Successfully migrated: ${migratedCount} products`);
    console.log(`⏭️  Skipped (already exists): ${skippedCount} products`);
    console.log(`📦 Total products processed: ${existingProducts.length}`);

    console.log('\n🎉 Migration completed successfully!');
    console.log('\n📋 Next Steps:');
    console.log('1. Products are now admin-managed globally');
    console.log('2. Agency-specific inventory is tracked separately');
    console.log('3. Agencies can manage their own stock and pricing');
    console.log('4. Admin can monitor all agency inventories');

  } catch (error) {
    console.error('❌ Migration failed:', error);
    throw error;
  } finally {
    await sequelize.close();
  }
}

// Run migration if called directly
if (require.main === module) {
  migrateToAdminProducts()
    .then(() => {
      console.log('✅ Migration script completed');
      process.exit(0);
    })
    .catch((error) => {
      console.error('❌ Migration script failed:', error);
      process.exit(1);
    });
}

module.exports = migrateToAdminProducts;
