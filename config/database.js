const { Sequelize } = require('sequelize');
require('dotenv').config();

const sequelize = new Sequelize(
  process.env.DB_NAME || 'lpg_gas_db',
  process.env.DB_USER || 'postgres',
  process.env.DB_PASSWORD || '12345',
  {
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT || 5432,
    dialect: 'postgres',
    logging: false,
    pool: {
      max: 5,               // Conservative limit to prevent shared memory exhaustion
      min: 1,               // Minimum ready connections
      acquire: 30000,       // 30 seconds to acquire connection
      idle: 5000,           // Release idle connections after 5 seconds
      evict: 5000,          // Check for idle connections every 5 seconds
      maxUses: 50           // Recycle connections after 50 uses
    },
    dialectOptions: {
      connectTimeout: 20000,  // Connection timeout (20 seconds)
      statement_timeout: 10000, // Query timeout (10 seconds - aggressive)
      idle_in_transaction_session_timeout: 10000, // Prevent hanging transactions
      options: '-c work_mem=4MB -c temp_buffers=8MB' // Reduce per-connection memory
    },
    define: {
      timestamps: true,
      underscored: true,
      freezeTableName: true
    },
    retry: {
      max: 3,               // Retry failed queries up to 3 times
      match: [
        /SequelizeConnectionError/,
        /SequelizeConnectionRefusedError/,
        /SequelizeHostNotFoundError/,
        /SequelizeHostNotReachableError/,
        /SequelizeInvalidConnectionError/,
        /SequelizeConnectionTimedOutError/,
        /ECONNREFUSED/,
        /ETIMEDOUT/,
        /EHOSTUNREACH/,
        /out of shared memory/  // Retry on shared memory errors
      ]
    }
  }
);

module.exports = {
  sequelize,
  Sequelize
};
