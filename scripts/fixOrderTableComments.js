const { sequelize } = require('../config/database');

async function fixOrderTableComments() {
  try {
    console.log('🔧 Fixing Order table column comments...');
    
    // Add comments to ENUM columns manually (avoiding Sequelize bug)
    const comments = [
      { column: 'return_approved_by', comment: 'Who approved the return request' },
      { column: 'return_rejected_by', comment: 'Who rejected the return request' },
      { column: 'return_approved_by_id', comment: 'ID of the user who approved the return' },
      { column: 'return_rejected_by_id', comment: 'ID of the user who rejected the return' },
      { column: 'return_approved_by_name', comment: 'Name of the user who approved the return' },
      { column: 'return_rejected_by_name', comment: 'Name of the user who rejected the return' },
      { column: 'cancelled_by_id', comment: 'ID of the user who cancelled the order' },
      { column: 'cancelled_by_name', comment: 'Name of the user who cancelled the order' },
      { column: 'returned_by_id', comment: 'ID of the user who returned the order' },
      { column: 'returned_by_name', comment: 'Name of the user who returned the order' },
      { column: 'return_reason', comment: 'Reason for returning the order' },
      { column: 'return_approved_at', comment: 'Timestamp when return request was approved' },
      { column: 'return_rejected_at', comment: 'Timestamp when return request was rejected' },
      { column: 'reordered_at', comment: 'Timestamp when order was reordered (reactivated from cancelled/returned)' },
      { column: 'delivery_proof_image', comment: 'Cloudinary URL of delivery proof image' },
      { column: 'delivery_note', comment: 'Delivery note from agent' },
      { column: 'payment_received', comment: 'Whether payment was received by agent' }
    ];
    
    for (const { column, comment } of comments) {
      try {
        // Check if column exists
        const [colExists] = await sequelize.query(`
          SELECT column_name 
          FROM information_schema.columns 
          WHERE table_name = 'orders' 
          AND column_name = '${column}'
        `);
        
        if (colExists.length > 0) {
          await sequelize.query(`
            COMMENT ON COLUMN "orders"."${column}" IS '${comment.replace(/'/g, "''")}';
          `);
          console.log(`   ✅ Added comment to ${column}`);
        } else {
          console.log(`   ⚠️  Column ${column} does not exist, skipping`);
        }
      } catch (error) {
        console.log(`   ⚠️  Failed to add comment to ${column}: ${error.message}`);
      }
    }
    
    console.log('✅ Order table comments fixed successfully!');
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Failed to fix Order table comments:', error);
    console.error('Error details:', error.message);
    process.exit(1);
  }
}

// Run if this file is executed directly
if (require.main === module) {
  fixOrderTableComments();
}

module.exports = fixOrderTableComments;
