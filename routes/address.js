const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const { User } = require('../models');
const { sequelize } = require('../config/database');
const { createError } = require('../utils/errorHandler');
const {
  addAddressHandler,
  getAddressesHandler,
  updateAddressHandler,
  deleteAddressHandler,
  updateAllAddressesHandler
} = require('../controllers/addressController');

// Add new address
router.post('/', authenticate, addAddressHandler);

// Get all addresses
router.get('/', authenticate, getAddressesHandler);

// Update specific address
router.put('/:addressId', authenticate, updateAddressHandler);

// Delete specific address
router.delete('/:addressId', authenticate, deleteAddressHandler);

// Alternative delete method using direct SQL
router.delete('/:addressId/force', authenticate, async (req, res, next) => {
  try {
    const { addressId } = req.params;
    const userId = req.user.userId;
    
    // Get current user
    const user = await User.findByPk(userId);
    if (!user) {
      return next(createError(404, 'User not found'));
    }
    
    const addresses = user.addresses || [];
    const addressToDelete = addresses.find(addr => addr.id === addressId);
    
    if (!addressToDelete) {
      return next(createError(404, 'Address not found'));
    }
    
    const filteredAddresses = addresses.filter(addr => addr.id !== addressId);
    
    // Direct SQL update
    await sequelize.query(
      'UPDATE users SET addresses = :addresses WHERE id = :userId',
      {
        replacements: { 
          addresses: JSON.stringify(filteredAddresses),
          userId: userId
        },
        type: sequelize.QueryTypes.UPDATE
      }
    );
    
    res.status(200).json({
      success: true,
      message: 'Address deleted successfully (direct SQL)',
      data: {
        deletedAddress: addressToDelete,
        remainingCount: filteredAddresses.length
      }
    });
  } catch (error) {
    next(error);
  }
});

// Update all addresses (bulk update)
router.put('/bulk', authenticate, updateAllAddressesHandler);

// Debug endpoint to check database state
router.get('/debug', authenticate, async (req, res, next) => {
  try {
    const userId = req.user.userId;
    const user = await User.findByPk(userId);
    
    if (!user) {
      return next(createError(404, 'User not found'));
    }

    res.status(200).json({
      success: true,
      message: 'Debug info',
      data: {
        userId: user.id,
        addresses: user.addresses,
        addressesCount: user.addresses ? user.addresses.length : 0,
        rawAddresses: JSON.stringify(user.addresses)
      }
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
