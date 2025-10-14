const { AgencyOwner } = require('../models');
const { sequelize } = require('../config/database');
const bcrypt = require('bcrypt');

async function fixAllAgencyPasswords() {
  try {
    console.log('🔍 Fetching all agency owners...\n');
    
    const agencyOwners = await AgencyOwner.findAll({
      attributes: ['id', 'name', 'email', 'password', 'isActive', 'isEmailVerified'],
      order: [['createdAt', 'DESC']]
    });

    if (agencyOwners.length === 0) {
      console.log('❌ No agency owners found');
      return;
    }

    console.log(`📋 Found ${agencyOwners.length} agency owners\n`);
    console.log('=' .repeat(80));
    
    for (const owner of agencyOwners) {
      console.log(`🏢 Agency: ${owner.name}`);
      console.log(`📧 Email: ${owner.email}`);
      console.log(`🔑 Current Hash: ${owner.password}`);
      
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

      console.log(`🔑 New Password: ${simplePassword}`);
      console.log(`✅ Password updated successfully`);
      console.log('-'.repeat(40));
    }

    console.log('\n🎉 All agency passwords have been reset!');
    console.log('💡 New passwords are: email_prefix + "123"');
    console.log('💡 Example: ankit@yopmail.com → password: ankit123');
    
  } catch (error) {
    console.error('❌ Error fixing agency passwords:', error);
  }
}

// Run the script
fixAllAgencyPasswords().then(() => {
  console.log('\n✅ Script completed');
  process.exit(0);
}).catch(error => {
  console.error('❌ Script failed:', error);
  process.exit(1);
});
