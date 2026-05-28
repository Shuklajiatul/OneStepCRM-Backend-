/**
 * migrate.js
 * ─────────────────────────────────────────────────────────
 * Database migration runner.
 * Reads SQL files from /migrations/ and executes them in order.
 * Tracks applied migrations in a _migrations table.
 *
 * Usage: node migrate.js
 */

const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');
const config = require('./config/environment');

const pool = new Pool({
  host: config.db.host,
  port: config.db.port,
  database: config.db.database,
  user: config.db.user,
  password: config.db.password,
});

const MIGRATIONS_DIR = path.join(__dirname, 'migrations');

/**
 * Ensure the _migrations tracking table exists.
 */
async function ensureMigrationsTable() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS _migrations (
      id SERIAL PRIMARY KEY,
      filename VARCHAR(255) NOT NULL UNIQUE,
      applied_at TIMESTAMPTZ DEFAULT NOW()
    );
  `);
}

/**
 * Get list of already-applied migration filenames.
 * @returns {Promise<Set<string>>}
 */
async function getAppliedMigrations() {
  const result = await pool.query('SELECT filename FROM _migrations ORDER BY id');
  return new Set(result.rows.map((r) => r.filename));
}

/**
 * Get all migration files sorted by name.
 * @returns {string[]}
 */
function getMigrationFiles() {
  return fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.sql'))
    .sort();
}

/**
 * Run all pending migrations.
 */
async function runMigrations() {
  console.log('═══════════════════════════════════════════════');
  console.log('  OneStepCRM — Database Migration Runner');
  console.log('═══════════════════════════════════════════════\n');

  try {
    await ensureMigrationsTable();
    const applied = await getAppliedMigrations();
    const files = getMigrationFiles();

    let pendingCount = 0;

    for (const file of files) {
      if (applied.has(file)) {
        console.log(`  ✓ ${file} (already applied)`);
        continue;
      }

      pendingCount++;
      const filePath = path.join(MIGRATIONS_DIR, file);
      const sql = fs.readFileSync(filePath, 'utf8');

      console.log(`  ▶ Running: ${file} ...`);

      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        await client.query(sql);
        await client.query('INSERT INTO _migrations (filename) VALUES ($1)', [file]);
        await client.query('COMMIT');
        console.log(`  ✓ ${file} applied successfully`);
      } catch (err) {
        await client.query('ROLLBACK');
        console.error(`\n  ✗ FAILED: ${file}`);
        console.error(`    Error: ${err.message}\n`);
        process.exit(1);
      } finally {
        client.release();
      }
    }

    if (pendingCount === 0) {
      console.log('\n  All migrations are up to date. Nothing to do.\n');
    } else {
      console.log(`\n  ✓ ${pendingCount} migration(s) applied successfully.\n`);
    }
  } catch (err) {
    console.error('Migration runner error:', err.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

// Run migrations
runMigrations();
