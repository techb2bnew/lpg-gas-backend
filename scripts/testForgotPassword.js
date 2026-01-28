const { AgencyOwner, User, LoginOTP } = require('../models');

async function testForgotPassword(email) {
  try {
    console.log(`🔍 Testing forgot password for: ${email}\n`);
    
    // Check if user exists in User table (Admin)
    let user = await User.findOne({ where: { email, role: 'admin' } });
    let userType = 'admin';

    if (user) {
      console.log('✅ Found admin user');
      console.log(`📧 Email: ${user.email}`);
      console.log(`👤 Role: ${user.role}`);
    } else {
      // Check if agency owner exists
      const agencyOwner = await AgencyOwner.findOne({ where: { email } });
      if (agencyOwner) {
        
        userType = 'agency_owner';
      } else {
        console.log('❌ User not found in any table');
        return;
      }
    }

    // Generate OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

    console.log(`\n🔑 Generated OTP: ${otp}`);
    console.log(`⏰ Expires at: ${expiresAt}`);

    // Delete any existing OTP
    await LoginOTP.destroy({ where: { email, role: userType } });
    // Create new OTP
    await LoginOTP.create({ email, otp, role: userType, expiresAt });
    console.log('✅ OTP created successfully');
    
  } catch (error) {
    console.error('❌ Error testing forgot password:', error);
  }
}

// Get command line arguments
const args = process.argv.slice(2);
const email = args[0];

if (!email) {
  console.log('❌ Usage: node testForgotPassword.js <email>');
  console.log('💡 Example: node testForgotPassword.js dilshad@yopmail.com');
  process.exit(1);
}

// Run the test
testForgotPassword(email).then(() => {
  console.log('\n✅ Test completed');
  process.exit(0);
}).catch(error => {
  console.error('❌ Test failed:', error);
  process.exit(1);
});
