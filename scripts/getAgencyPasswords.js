const { AgencyOwner } = require('../models');
const bcrypt = require('bcrypt');

async function getAgencyPasswords() {
  try {
    console.log('🔍 Fetching agency owner passwords...\n');
    
    const agencyOwners = await AgencyOwner.findAll({
      attributes: ['id', 'name', 'email', 'password', 'isActive', 'isEmailVerified'],
      order: [['createdAt', 'DESC']]
    });

    if (agencyOwners.length === 0) {
      console.log('❌ No agency owners found');
      return;
    }

    console.log('📋 Agency Owner Passwords:\n');
    console.log('=' .repeat(80));
    
    for (const owner of agencyOwners) {
      console.log(`🏢 Agency: ${owner.name}`);
      console.log(`📧 Email: ${owner.email}`);
      console.log(`🔑 Password Hash: ${owner.password}`);
      console.log(`✅ Active: ${owner.isActive}`);
      console.log(`📧 Email Verified: ${owner.isEmailVerified}`);
      console.log('-'.repeat(40));
    }

    console.log('\n💡 Note: These are the hashed passwords. The original passwords were sent via email.');
    console.log('💡 If you need to reset passwords, use the reset password functionality.');
    
  } catch (error) {
    console.error('❌ Error fetching agency passwords:', error);
  }
}

// Run the script
getAgencyPasswords().then(() => {
  console.log('\n✅ Script completed');
  process.exit(0);
}).catch(error => {
  console.error('❌ Script failed:', error);
  process.exit(1);
});
