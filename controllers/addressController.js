const { User } = require('../models');
const { sequelize } = require('../config/database');
const { addAddress, updateAddress } = require('../validations/addressValidation');
const { createError } = require('../utils/errorHandler');
const logger = require('../utils/logger');

// Add new address to user profile
const addAddressHandler = async (req, res, next) => {
  try {
    // Validate request body
    const { error, value } = addAddress.validate(req.body);
    if (error) {
      return next(createError(400, error.details[0].message));
    }

    const userId = req.user.userId;
    const user = await User.findByPk(userId);
    
    if (!user) {
      return next(createError(404, 'User not found'));
    }

    // Get existing addresses or initialize empty array
    const existingAddresses = user.addresses || [];
    
    // Add new address with unique ID
    const newAddress = {
      id: `addr-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      ...value
    };

    // Add to addresses array
    const updatedAddresses = [...existingAddresses, newAddress];

    // Update user
    await user.update({ addresses: updatedAddresses });


    res.status(201).json({
      success: true,
      message: 'Address added successfully',
      data: {
        address: newAddress,
        totalAddresses: updatedAddresses.length
      }
    });
  } catch (error) {
    next(error);
  }
};

// Get all addresses for user
const getAddressesHandler = async (req, res, next) => {
  try {
    const userId = req.user.userId;
    const user = await User.findByPk(userId);
    
    if (!user) {
      return next(createError(404, 'User not found'));
    }

    const addresses = user.addresses || [];

    res.status(200).json({
      success: true,
      message: 'Addresses retrieved successfully',
      data: {
        addresses,
        totalCount: addresses.length
      }
    });
  } catch (error) {
    next(error);
  }
};

// Update specific address
const updateAddressHandler = async (req, res, next) => {
  try {
    const { addressId } = req.params;
    
    // Validate request body
    const { error, value } = updateAddress.validate(req.body);
    if (error) {
      return next(createError(400, error.details[0].message));
    }

    const userId = req.user.userId;
    
    
    // Get current user
    const user = await User.findByPk(userId);
    if (!user) {
      return next(createError(404, 'User not found'));
    }

    const addresses = user.addresses || [];
    
    const addressIndex = addresses.findIndex(addr => addr.id === addressId);

    if (addressIndex === -1) {
      return next(createError(404, 'Address not found'));
    }

    // Update the address
    addresses[addressIndex] = {
      ...addresses[addressIndex],
      ...value
    };
    
    // Use direct SQL update to ensure persistence
    const [results] = await sequelize.query(
      'UPDATE users SET addresses = :addresses WHERE id = :userId',
      {
        replacements: { 
          addresses: JSON.stringify(addresses),
          userId: userId
        },
        type: sequelize.QueryTypes.UPDATE
      }
    );
    
    
    // Verify the update by querying the database directly
    const [verifyResults] = await sequelize.query(
      'SELECT addresses FROM users WHERE id = :userId',
      {
        replacements: { userId: userId },
        type: sequelize.QueryTypes.SELECT
      }
    );
    
    const updatedAddresses = verifyResults[0]?.addresses || [];
    const updatedAddress = updatedAddresses.find(addr => addr.id === addressId);

    res.status(200).json({
      success: true,
      message: 'Address updated successfully',
      data: {
        address: updatedAddress
      }
    });
  } catch (error) {
    next(error);
  }
};

// Delete specific address
const deleteAddressHandler = async (req, res, next) => {
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
    
    // Use direct SQL update to ensure persistence
    const [results] = await sequelize.query(
      'UPDATE users SET addresses = :addresses WHERE id = :userId',
      {
        replacements: { 
          addresses: JSON.stringify(filteredAddresses),
          userId: userId
        },
        type: sequelize.QueryTypes.UPDATE
      }
    );
    
    
    // Verify the update by querying the database directly
    const [verifyResults] = await sequelize.query(
      'SELECT addresses FROM users WHERE id = :userId',
      {
        replacements: { userId: userId },
        type: sequelize.QueryTypes.SELECT
      }
    );
    
    const updatedAddresses = verifyResults[0]?.addresses || [];

    res.status(200).json({
      success: true,
      message: 'Address deleted successfully',
      data: {
        deletedAddress: addressToDelete,
        remainingCount: updatedAddresses.length
      }
    });
  } catch (error) {
    next(error);
  }
};

// Update all addresses (bulk update)
const updateAllAddressesHandler = async (req, res, next) => {
  try {
    const { addresses } = req.body;
    const userId = req.user.userId;
    const user = await User.findByPk(userId);
    
    if (!user) {
      return next(createError(404, 'User not found'));
    }

    // Validate addresses array
    if (!Array.isArray(addresses)) {
      return next(createError(400, 'Addresses must be an array'));
    }

    // Validate each address
    const { addAddress } = require('../validations/addressValidation');
    for (let i = 0; i < addresses.length; i++) {
      const { error } = addAddress.validate(addresses[i]);
      if (error) {
        return next(createError(400, `Address ${i + 1}: ${error.details[0].message}`));
      }
    }

    // Add unique IDs to addresses that don't have them
    const updatedAddresses = addresses.map(addr => ({
      id: addr.id || `addr-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      ...addr
    }));

    // Update user with new addresses array
    await user.update({ addresses: updatedAddresses });
    
    // Reload user from database to ensure data is persisted
    await user.reload();

    res.status(200).json({
      success: true,
      message: 'All addresses updated successfully',
      data: {
        addresses: user.addresses,
        totalCount: user.addresses.length
      }
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  addAddressHandler,
  getAddressesHandler,
  updateAddressHandler,
  deleteAddressHandler,
  updateAllAddressesHandler
};
