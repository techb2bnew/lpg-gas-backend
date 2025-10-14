const { AgencyOwner } = require('../models');
const bcrypt = require('bcrypt');

async function testAgencyLogin(email, password) {
  try {
    console.log(`🔍 Testing login for: ${email}`);
    console.log(`🔑 Testing password: ${password}\n`);
    
    const agencyOwner = await AgencyOwner.findOne({
      where: { email }
    });

    if (!agencyOwner) {
      console.log('❌ Agency owner not found');
      return;
    }

    console.log(`✅ Found agency owner: ${agencyOwner.name}`);
    console.log(`📧 Email: ${agencyOwner.email}`);
    console.log(`🔑 Stored hash: ${agencyOwner.password}`);
    console.log(`✅ Active: ${agencyOwner.isActive}`);
    console.log(`📧 Email Verified: ${agencyOwner.isEmailVerified}\n`);

    // Test password
    const isPasswordValid = await agencyOwner.comparePassword(password);
    console.log(`🔐 Password validation result: ${isPasswordValid}`);
    
    if (isPasswordValid) {
      console.log('🎉 LOGIN SUCCESSFUL!');
    } else {
      console.log('❌ LOGIN FAILED - Invalid password');
    }
    
  } catch (error) {
    console.error('❌ Error testing login:', error);
  }
}

// Get command line arguments
const args = process.argv.slice(2);
const email = args[0];
const password = args[1];

if (!email || !password) {
  console.log('❌ Usage: node testAgencyLogin.js <email> <password>');
  console.log('💡 Example: node testAgencyLogin.js rishav@yopmail.com rishav123');
  process.exit(1);
}

// Run the test
testAgencyLogin(email, password).then(() => {
  console.log('\n✅ Test completed');
  process.exit(0);
}).catch(error => {
  console.error('❌ Test failed:', error);
  process.exit(1);
});
