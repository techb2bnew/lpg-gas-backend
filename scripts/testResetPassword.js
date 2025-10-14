const { AgencyOwner, LoginOTP } = require('../models');

async function testResetPassword(email, otp, newPassword) {
  try {
    console.log(`🔍 Testing reset password for: ${email}`);
    console.log(`🔑 OTP: ${otp}`);
    console.log(`🔑 New Password: ${newPassword}\n`);
    
    // Find OTP record
    const otpRecord = await LoginOTP.findOne({
      where: { email, otp, role: 'agency_owner', isUsed: false }
    });

    if (!otpRecord) {
      console.log('❌ Invalid OTP');
      return;
    }

    console.log('✅ OTP found');
    console.log(`⏰ Expires at: ${otpRecord.expiresAt}`);

    // Check if OTP is expired
    if (new Date() > new Date(otpRecord.expiresAt)) {
      console.log('❌ OTP has expired');
      return;
    }

    // Find agency owner
    const agencyOwner = await AgencyOwner.findOne({ where: { email } });
    if (!agencyOwner) {
      console.log('❌ Agency owner not found');
      return;
    }

    console.log('✅ Agency owner found');
    console.log(`🏢 Agency: ${agencyOwner.name}`);

    // Update password
    await agencyOwner.update({ password: newPassword });
    console.log('✅ Password updated successfully');

    // Mark OTP as used
    await otpRecord.update({ isUsed: true });
    console.log('✅ OTP marked as used');

    console.log('\n🎉 Password reset successful!');
    console.log(`📧 Email: ${email}`);
    console.log(`🔑 New Password: ${newPassword}`);
    
  } catch (error) {
    console.error('❌ Error testing reset password:', error);
  }
}

// Get command line arguments
const args = process.argv.slice(2);
const email = args[0];
const otp = args[1];
const newPassword = args[2];

if (!email || !otp || !newPassword) {
  console.log('❌ Usage: node testResetPassword.js <email> <otp> <newPassword>');
  console.log('💡 Example: node testResetPassword.js dilshad@yopmail.com 807069 newpass123');
  process.exit(1);
}

// Run the test
testResetPassword(email, otp, newPassword).then(() => {
  console.log('\n✅ Test completed');
  process.exit(0);
}).catch(error => {
  console.error('❌ Test failed:', error);
  process.exit(1);
});
