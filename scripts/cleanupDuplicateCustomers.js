const { User, Order } = require('../models');
const { sequelize } = require('../config/database');

async function cleanupDuplicateCustomers() {
  try {
    console.log('🧹 Starting duplicate customers cleanup...');

    // Find all customers
    const customers = await User.findAll({
      where: { role: 'customer' },
      order: [['email', 'ASC'], ['createdAt', 'ASC']]
    });

    console.log(`📊 Found ${customers.length} total customers`);

    // Group customers by email
    const emailGroups = {};
    customers.forEach(customer => {
      if (!emailGroups[customer.email]) {
        emailGroups[customer.email] = [];
      }
      emailGroups[customer.email].push(customer);
    });

    // Find duplicates
    const duplicates = Object.entries(emailGroups).filter(([email, users]) => users.length > 1);
    
    console.log(`🔍 Found ${duplicates.length} email addresses with duplicates`);

    let deletedCount = 0;
    let keptCount = 0;

    for (const [email, users] of duplicates) {
      console.log(`\n📧 Processing email: ${email} (${users.length} duplicates)`);
      
      // Sort by creation date (keep the oldest one)
      users.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
      const keepUser = users[0];
      const deleteUsers = users.slice(1);

      console.log(`✅ Keeping user: ${keepUser.id} (created: ${keepUser.createdAt})`);
      
      // Check if any of the users to be deleted have orders
      for (const user of deleteUsers) {
        const userOrders = await Order.findAll({
          where: { customerEmail: user.email }
        });

        if (userOrders.length > 0) {
          console.log(`⚠️  User ${user.id} has ${userOrders.length} orders. Updating orders to point to kept user.`);
          
          // Update orders to point to the kept user
          await Order.update(
            { customerEmail: keepUser.email },
            { where: { customerEmail: user.email } }
          );
        }

        // Delete the duplicate user
        await user.destroy();
        deletedCount++;
        console.log(`❌ Deleted duplicate user: ${user.id}`);
      }
      
      keptCount++;
    }

    console.log(`\n🎉 Cleanup completed!`);
    console.log(`✅ Kept: ${keptCount} unique customers`);
    console.log(`❌ Deleted: ${deletedCount} duplicate customers`);

    // Show final count
    const finalCount = await User.count({ where: { role: 'customer' } });
    console.log(`📊 Final customer count: ${finalCount}`);

  } catch (error) {
    console.error('❌ Error during cleanup:', error.message);
    throw error;
  } finally {
    await sequelize.close();
  }
}

// Run the cleanup
cleanupDuplicateCustomers();
