const { AgencyOwner, Agency } = require('../models');
const bcrypt = require('bcrypt');
const crypto = require('crypto');

async function testNewAgency() {
  try {
    console.log('🧪 Testing new agency creation...\n');
    
    const testEmail = 'test@yopmail.com';
    const testPassword = crypto.randomBytes(8).toString('hex');
    
    console.log(`📧 Test Email: ${testEmail}`);
    console.log(`🔑 Test Password: ${testPassword}\n`);
    
    // Create test agency owner
    const agencyOwner = await AgencyOwner.create({
      name: 'Test Agency Owner',
      email: testEmail,
      password: testPassword, // This should be hashed by beforeCreate hook
      phone: '9876543210',
      agencyId: '00000000-0000-0000-0000-000000000000', // Dummy ID
      address: 'Test Address',
      city: 'Test City',
      pincode: '123456',
      state: 'Test State'
    });
    
    console.log('✅ Agency owner created successfully');
    console.log(`🔑 Stored hash: ${agencyOwner.password}`);
    console.log(`🔑 Hash length: ${agencyOwner.password.length}\n`);
    
    // Test password comparison
    const isPasswordValid = await agencyOwner.comparePassword(testPassword);
    console.log(`🔐 Password validation result: ${isPasswordValid}`);
    
    if (isPasswordValid) {
      console.log('🎉 SUCCESS: New agency password works correctly!');
    } else {
      console.log('❌ FAILED: New agency password does not work');
    }
    
    // Clean up - delete test agency owner
    await agencyOwner.destroy();
    console.log('\n🧹 Test agency owner cleaned up');
    
  } catch (error) {
    console.error('❌ Error testing new agency:', error);
  }
}

// Run the test
testNewAgency().then(() => {
  console.log('\n✅ Test completed');
  process.exit(0);
}).catch(error => {
  console.error('❌ Test failed:', error);
  process.exit(1);
});
