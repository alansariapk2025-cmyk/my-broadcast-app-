// ================================================================
// db/pool.js - PostgreSQL Connection Pooling
// ================================================================
// Features:
// - Connection pooling for better performance
// - Configurable pool size
// - Error handling and reconnection
// - Query timeout protection
// ================================================================

const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

// Determine environment
const isDev = process.env.NODE_ENV !== 'production';
const isProduction = process.env.NODE_ENV === 'production';

// ================================================================
// 🔌 CONNECTION CONFIGURATION
// ================================================================
const poolConfig = {
  // Connection Details
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 5432,
  database: process.env.DB_NAME || 'pos_multitenant',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'postgres',

  // Pool Configuration
  max: parseInt(process.env.DB_POOL_MAX || '20'), // Max connections
  min: parseInt(process.env.DB_POOL_MIN || '5'), // Min connections
  idleTimeoutMillis: parseInt(process.env.DB_IDLE_TIMEOUT || '30000'), // 30s
  connectionTimeoutMillis: parseInt(
    process.env.DB_CONNECTION_TIMEOUT || '10000'
  ), // 10s

  // SSL (if needed)
  ssl: isProduction
    ? {
        rejectUnauthorized: true,
        ca: process.env.DB_SSL_CA ? [process.env.DB_SSL_CA] : undefined,
      }
    : false,

  // Statement Timeout
  statement_timeout: 30000, // 30s query timeout
};

// ================================================================
// ✅ POOL INSTANCE
// ================================================================
const pool = new Pool(poolConfig);

// ================================================================
// 📊 POOL EVENT HANDLERS
// ================================================================
pool.on('connect', (client) => {
  if (isDev) {
    console.log('✅ PostgreSQL connection acquired');
  }
});

pool.on('error', (err, client) => {
  console.error('❌ Unexpected PostgreSQL client error:', err);
  process.exit(-1);
});

// ================================================================
// 🔄 GRACEFUL SHUTDOWN
// ================================================================
process.on('SIGTERM', async () => {
  console.log('🛑 SIGTERM: Draining connection pool...');
  await pool.end();
  console.log('✅ Connection pool closed');
});

// ================================================================
// 📝 HELPER: EXECUTE QUERY WITH CONTEXT
// ================================================================

/**
 * Execute a query with app context (shop_id, user_id, etc.)
 * @param {string} text SQL query text
 * @param {array} values Query parameters
 * @param {object} context Context object { shop_id, user_id, is_super_admin }
 * @returns {Promise} Query result
 */
async function query(text, values = [], context = {}) {
  const client = await pool.connect();

  try {
    // Set application context for RLS
    if (context.shop_id) {
      await client.query(
        "SET app.shop_id = $1",
        [context.shop_id]
      );
    }

    if (context.user_id) {
      await client.query(
        "SET app.user_id = $1",
        [context.user_id]
      );
    }

    if (context.is_super_admin !== undefined) {
      await client.query(
        "SET app.is_super_admin = $1",
        [context.is_super_admin]
      );
    }

    // Execute query
    const result = await client.query(text, values);
    return result;
  } catch (error) {
    console.error('Query error:', error.message, { text, values, context });
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Execute queries in a transaction
 * @param {function} callback Function that receives client and executes queries
 * @param {object} context Context object
 * @returns {Promise} Result from callback
 */
async function transaction(callback, context = {}) {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // Set context
    if (context.shop_id) {
      await client.query(
        "SET app.shop_id = $1",
        [context.shop_id]
      );
    }

    if (context.user_id) {
      await client.query(
        "SET app.user_id = $1",
        [context.user_id]
      );
    }

    if (context.is_super_admin !== undefined) {
      await client.query(
        "SET app.is_super_admin = $1",
        [context.is_super_admin]
      );
    }

    // Execute callback
    const result = await callback(client);

    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Transaction error:', error.message);
    throw error;
  } finally {
    client.release();
  }
}

// ================================================================
// 📊 POOL HEALTH CHECK
// ================================================================
async function healthCheck() {
  try {
    const result = await pool.query('SELECT NOW()');
    return {
      status: 'healthy',
      timestamp: result.rows[0].now,
      poolSize: pool.totalCount,
      idleCount: pool.idleCount,
      waitingCount: pool.waitingCount,
    };
  } catch (error) {
    return {
      status: 'unhealthy',
      error: error.message,
    };
  }
}

// ================================================================
// 📊 POOL STATISTICS
// ================================================================
function getPoolStats() {
  return {
    totalConnections: pool.totalCount,
    idleConnections: pool.idleCount,
    activeConnections: pool.totalCount - pool.idleCount,
    waitingRequests: pool.waitingCount,
  };
}

// ================================================================
// EXPORTS
// ================================================================
module.exports = {
  pool,
  query,
  transaction,
  healthCheck,
  getPoolStats,
};
