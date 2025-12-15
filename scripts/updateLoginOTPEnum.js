const { sequelize } = require('../config/database');

async function updateLoginOTPEnum() {
  try {
   
    // Add agency_owner to the enum
    await sequelize.query("ALTER TYPE enum_login_otps_role ADD VALUE 'agency_owner';");
        
  } catch (error) {
    if (error.message.includes('already exists')) {
      console.log('ℹ️  Enum value already exists');
    } else {
      console.error('❌ Error updating enum:', error.message);
    }
  }
}

// Run the script
updateLoginOTPEnum().then(() => {
  console.log('\n✅ Script completed');
  process.exit(0);
}).catch(error => {
  console.error('❌ Script failed:', error);
  process.exit(1);
});
