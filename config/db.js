require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432', 10),
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'smart_library',
  max: 10,                       // max simultaneous connections
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 3000
});

pool.on('error', (err) => {
  console.error('[PostgreSQL] Unexpected error on idle client:', err.message);
});

// Simple helper so call sites can just do: const { rows } = await query('SELECT ...', [params])
async function query(text, params) {
  return pool.query(text, params);
}

// One-time connectivity check used at server startup so failures are loud
// and obvious instead of surfacing as confusing errors on the first request.
async function verifyConnection() {
  try {
    await pool.query('SELECT 1');
    console.log(`[PostgreSQL] Connected to database "${process.env.DB_NAME || 'smart_library'}" at ${process.env.DB_HOST || 'localhost'}:${process.env.DB_PORT || 5432}`);
    return true;
  } catch (err) {
    console.error('[PostgreSQL] Connection FAILED:', err.message);
    console.error('  -> Check your .env file (DB_HOST/DB_PORT/DB_USER/DB_PASSWORD/DB_NAME)');
    console.error('  -> Make sure PostgreSQL is running and the database + schema exist.');
    console.error('  -> See SETUP_GUIDE.md for step-by-step instructions.');
    return false;
  }
}

module.exports = { pool, query, verifyConnection };
