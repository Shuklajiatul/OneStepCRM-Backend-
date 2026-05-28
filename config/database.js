/**
 * config/database.js
 * ─────────────────────────────────────────────────────────
 * PostgreSQL connection pool using node-postgres (pg).
 * Provides query helper and transaction wrapper.
 */

const { Pool } = require('pg');
const config = require('./environment');

// Create the connection pool
const pool = new Pool({
  host: config.db.host,
  port: config.db.port,
  database: config.db.database,
  user: config.db.user,
  password: config.db.password,
  max: config.db.max,
  idleTimeoutMillis: config.db.idleTimeoutMillis,
});

// Log pool errors so they don't crash the process silently
pool.on('error', (err) => {
  console.error('[DB] Unexpected pool error:', err.message);
});

// Log successful connection on first query
pool.on('connect', () => {
  if (config.isDev) {
    console.log('[DB] New client connected to PostgreSQL');
  }
});

/**
 * Execute a parameterized query against the pool.
 * @param {string} text - SQL query string with $1, $2, ... placeholders
 * @param {Array} params - Parameter values
 * @returns {Promise<import('pg').QueryResult>}
 */
async function query(text, params = []) {
  const start = Date.now();
  try {
    const result = await pool.query(text, params);
    const duration = Date.now() - start;
    if (config.isDev) {
      console.log('[DB] Query executed', { text: text.substring(0, 80), duration: `${duration}ms`, rows: result.rowCount });
    }
    return result;
  } catch (err) {
    console.error('[DB] Query error:', { text: text.substring(0, 80), error: err.message });
    throw err;
  }
}

/**
 * Get a client from the pool for manual transaction control.
 * @returns {Promise<import('pg').PoolClient>}
 */
async function getClient() {
  const client = await pool.connect();
  return client;
}

/**
 * Execute a callback within a PostgreSQL transaction.
 * Automatically commits on success or rolls back on error.
 *
 * @param {function(import('pg').PoolClient): Promise<*>} callback
 * @returns {Promise<*>} - Whatever the callback returns
 *
 * @example
 * const result = await withTransaction(async (client) => {
 *   await client.query('INSERT INTO tenants ...', [...]);
 *   await client.query('INSERT INTO users ...', [...]);
 *   return { tenantId, userId };
 * });
 */
async function withTransaction(callback) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Gracefully close the pool (for shutdown hooks).
 */
async function closePool() {
  console.log('[DB] Closing PostgreSQL connection pool...');
  await pool.end();
  console.log('[DB] Pool closed.');
}

module.exports = {
  pool,
  query,
  getClient,
  withTransaction,
  closePool,
};
