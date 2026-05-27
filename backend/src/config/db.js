const { Pool } = require('pg');
const logger = require('../utils/logger');

const pool = new Pool({
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD,
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT) || 5432,
  database: process.env.DB_NAME || 'alumni_portal',
  max: parseInt(process.env.DATABASE_POOL_MAX) || 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

pool.on('connect', () => {
  logger.debug('New database connection established');
});

pool.on('error', (err) => {
  logger.error({ error: err.message }, 'Unexpected database pool error');
});

/**
 * Execute a SQL query with parameters.
 */
const query = async (text, params) => {
  const start = Date.now();
  try {
    const result = await pool.query(text, params);
    const duration = Date.now() - start;
    logger.debug({ duration, rows: result.rowCount }, 'DB query executed');
    return result;
  } catch (err) {
    logger.error({ error: err.message, query: text.substring(0, 100) }, 'DB query error');
    throw err;
  }
};

/**
 * Get a client from the pool for transactions.
 */
const getClient = async () => {
  return pool.connect();
};

module.exports = { query, getClient, pool };
