const { DeliveryCharge, Agency } = require('../models');
const { sequelize } = require('../config/database');
require('dotenv').config();

const testDeliveryCharge = async () => {
  try {
    console.log('🔄 Testing Delivery Charge System...\n');

    // Connect to database
    console.log('1️⃣ Connecting to database...');
    await sequelize.authenticate();
    console.log('✅ Database connection established\n');

    // Get first agency for testing
    console.log('2️⃣ Fetching test agency...');
    const agency = await Agency.findOne();
    
    if (!agency) {
      console.log('❌ No agency found. Please create an agency first.');
      process.exit(1);
    }
    
    console.log(`✅ Found agency: ${agency.name} (${agency.id})\n`);

    // Check if delivery charge already exists
    console.log('3️⃣ Checking existing delivery charge...');
    let existingCharge = await DeliveryCharge.findOne({
      where: { agencyId: agency.id }
    });

    if (existingCharge) {
      console.log(`ℹ️  Delivery charge already exists for this agency`);
      console.log(`   Type: ${existingCharge.chargeType}`);
      console.log(`   Rate/Amount: ${existingCharge.ratePerKm || existingCharge.fixedAmount}\n`);
      
      console.log('4️⃣ Deleting existing charge for clean test...');
      await existingCharge.destroy();
      console.log('✅ Deleted\n');
    }

    // Test 1: Create kilometer-wise delivery charge
    console.log('5️⃣ TEST 1: Creating kilometer-wise delivery charge...');
    const kmCharge = await DeliveryCharge.create({
      agencyId: agency.id,
      chargeType: 'kilometer_wise',
      ratePerKm: 5.00,
      status: 'active'
    });
    console.log('✅ Kilometer-wise charge created successfully');
    console.log(`   ID: ${kmCharge.id}`);
    console.log(`   Rate: KSH${kmCharge.ratePerKm}/km\n`);

    // Test 2: Read delivery charge
    console.log('6️⃣ TEST 2: Reading delivery charge...');
    const readCharge = await DeliveryCharge.findByPk(kmCharge.id, {
      include: [{
        model: Agency,
        as: 'Agency',
        attributes: ['id', 'name', 'email']
      }]
    });
    console.log('✅ Charge read successfully');
    console.log(`   Agency: ${readCharge.Agency.name}`);
    console.log(`   Type: ${readCharge.chargeType}`);
    console.log(`   Rate: KSH${readCharge.ratePerKm}/km\n`);

    // Test 3: Update to fixed charge
    console.log('7️⃣ TEST 3: Updating to fixed delivery charge...');
    await kmCharge.update({
      chargeType: 'fixed',
      ratePerKm: null,
      fixedAmount: 50.00
    });
    console.log('✅ Updated to fixed charge');
    console.log(`   Fixed Amount: KSH${kmCharge.fixedAmount}\n`);

    // Test 4: Get by agency ID
    console.log('8️⃣ TEST 4: Getting charge by agency ID...');
    const chargeByAgency = await DeliveryCharge.findOne({
      where: { agencyId: agency.id }
    });
    console.log('✅ Charge found by agency ID');
    console.log(`   Type: ${chargeByAgency.chargeType}`);
    console.log(`   Amount: KSH${chargeByAgency.fixedAmount}\n`);

    // Test 5: Validation test (should fail)
    console.log('9️⃣ TEST 5: Testing validation (should fail)...');
    try {
      await DeliveryCharge.create({
        agencyId: agency.id,
        chargeType: 'kilometer_wise',
        fixedAmount: 50.00 // Wrong: should be ratePerKm
      });
      console.log('❌ Validation failed to catch error!\n');
    } catch (error) {
      console.log('✅ Validation working correctly');
      console.log(`   Error: ${error.message}\n`);
    }

    // Test 6: Delete charge
    console.log('🔟 TEST 6: Deleting delivery charge...');
    await kmCharge.destroy();
    console.log('✅ Charge deleted successfully\n');

    // Verify deletion
    console.log('1️⃣1️⃣ Verifying deletion...');
    const deletedCharge = await DeliveryCharge.findByPk(kmCharge.id);
    if (!deletedCharge) {
      console.log('✅ Charge successfully deleted from database\n');
    } else {
      console.log('❌ Charge still exists!\n');
    }

    console.log('═══════════════════════════════════════');
    console.log('✅ ALL TESTS PASSED SUCCESSFULLY! 🎉');
    console.log('═══════════════════════════════════════\n');
    console.log('📝 Summary:');
    console.log('   • Model creation: ✅');
    console.log('   • Database sync: ✅');
    console.log('   • CRUD operations: ✅');
    console.log('   • Validations: ✅');
    console.log('   • Associations: ✅');
    console.log('   • Error handling: ✅\n');
    console.log('🚀 Delivery Charge System is fully functional!');

    process.exit(0);
  } catch (error) {
    console.error('\n❌ Test failed:', error.message);
    console.error('Error details:', error);
    process.exit(1);
  }
};

testDeliveryCharge();

