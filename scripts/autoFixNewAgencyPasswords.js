const { AgencyOwner } = require('../models');
const { sequelize } = require('../config/database');
const bcrypt = require('bcrypt');

async function autoFixNewAgencyPasswords() {
  try {
    console.log('🔍 Checking for agency owners with double-hashed passwords...\n');
    
    // Get all agency owners
    const agencyOwners = await AgencyOwner.findAll({
      attributes: ['id', 'name', 'email', 'password', 'isActive', 'isEmailVerified'],
      order: [['createdAt', 'DESC']]
    });

    if (agencyOwners.length === 0) {
      console.log('❌ No agency owners found');
      return;
    }

    console.log(`📋 Checking ${agencyOwners.length} agency owners\n`);
    
    let fixedCount = 0;
    
    for (const owner of agencyOwners) {
      console.log(`🔍 Checking: ${owner.email}`);
      
      // Try to detect if password is double-hashed by checking if it's too long
      // Double-hashed passwords are usually longer than normal bcrypt hashes
      const isDoubleHashed = owner.password.length > 70;
      
      if (isDoubleHashed) {
        console.log(`⚠️  Detected potential double-hashed password for: ${owner.email}`);
        
        // Generate a simple password based on email
        const simplePassword = owner.email.split('@')[0] + '123';
        
        // Hash the new password
        const hashedPassword = await bcrypt.hash(simplePassword, 12);

        // Update the password directly in the database
        await sequelize.query(
          'UPDATE agency_owners SET password = :password, updated_at = NOW() WHERE id = :id',
          {
            replacements: { password: hashedPassword, id: owner.id },
            type: sequelize.QueryTypes.UPDATE
          }
        );

        console.log(`✅ Fixed password for: ${owner.email}`);
        console.log(`🔑 New Password: ${simplePassword}`);
        fixedCount++;
      } else {
        console.log(`✅ Password looks fine for: ${owner.email}`);
      }
      console.log('-'.repeat(40));
    }

    if (fixedCount > 0) {
      console.log(`\n🎉 Fixed ${fixedCount} agency passwords!`);
      console.log('💡 New passwords are: email_prefix + "123"');
    } else {
      console.log('\n✅ All passwords look fine!');
    }
    
  } catch (error) {
    console.error('❌ Error fixing agency passwords:', error);
  }
}

// Run the script
autoFixNewAgencyPasswords().then(() => {
  console.log('\n✅ Script completed');
  process.exit(0);
}).catch(error => {
  console.error('❌ Script failed:', error);
  process.exit(1);
});
