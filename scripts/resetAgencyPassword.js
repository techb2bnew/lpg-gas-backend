const { AgencyOwner } = require('../models');
const bcrypt = require('bcrypt');
const crypto = require('crypto');

async function resetAgencyPassword(email, newPassword = null) {
  try {
    console.log(`🔍 Looking for agency owner with email: ${email}`);
    
    const agencyOwner = await AgencyOwner.findOne({
      where: { email }
    });

    if (!agencyOwner) {
      console.log('❌ Agency owner not found');
      return;
    }

    console.log(`✅ Found agency owner: ${agencyOwner.name}`);

    // Generate new password if not provided
    if (!newPassword) {
      newPassword = crypto.randomBytes(8).toString('hex');
    }

    // Hash the new password
    const hashedPassword = await bcrypt.hash(newPassword, 12);

    // Update the password
    await agencyOwner.update({
      password: hashedPassword
    });

    console.log('\n🎉 Password reset successful!');
    console.log('=' .repeat(50));
    console.log(`📧 Email: ${email}`);
    console.log(`🔑 New Password: ${newPassword}`);
    console.log('=' .repeat(50));
    console.log('\n💡 Please share this password with the agency owner.');
    console.log('💡 They should change it after first login.');
    
  } catch (error) {
    console.error('❌ Error resetting password:', error);
  }
}

// Get command line arguments
const args = process.argv.slice(2);
const email = args[0];
const newPassword = args[1];

if (!email) {
  console.log('❌ Usage: node resetAgencyPassword.js <email> [newPassword]');
  console.log('💡 Example: node resetAgencyPassword.js ankit@yopmail.com');
  console.log('💡 Example: node resetAgencyPassword.js ankit@yopmail.com mynewpassword');
  process.exit(1);
}

// Run the script
resetAgencyPassword(email, newPassword).then(() => {
  console.log('\n✅ Script completed');
  process.exit(0);
}).catch(error => {
  console.error('❌ Script failed:', error);
  process.exit(1);
});
