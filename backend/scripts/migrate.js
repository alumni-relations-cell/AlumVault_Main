require('dotenv').config();
const { Client } = require('pg');
const fs = require('fs');
const path = require('path');

const { DB_USER, DB_PASSWORD, DB_HOST, DB_PORT, DB_NAME } = process.env;

const client = new Client({
  user: DB_USER,
  password: DB_PASSWORD,
  host: DB_HOST,
  port: parseInt(DB_PORT),
  database: DB_NAME,
});

const MIGRATIONS_DIR = path.join(__dirname, '../migrations');

async function run() {
  await client.connect();

  // Create migrations tracking table if it doesn't exist
  await client.query(`
    CREATE TABLE IF NOT EXISTS pgmigrations (
      id SERIAL PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      run_on TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  // Get already-run migrations
  const { rows } = await client.query('SELECT name FROM pgmigrations');
  const ran = new Set(rows.map(r => r.name));

  // Get all migration files sorted
  const files = fs.readdirSync(MIGRATIONS_DIR)
    .filter(f => f.endsWith('.sql'))
    .sort();

  const direction = process.argv[2] || 'up';

  if (direction === 'up') {
    for (const file of files) {
      const name = file.replace('.sql', '');
      if (ran.has(name)) {
        console.log(`  skip: ${name}`);
        continue;
      }

      const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8');
      const upMatch = sql.match(/--\s*Up\s*([\s\S]*?)(?:--\s*Down|$)/i);
      if (!upMatch) {
        console.error(`No -- Up section found in ${file}`);
        process.exit(1);
      }

      const upSql = upMatch[1].trim();
      console.log(`  run:  ${name}`);
      await client.query('BEGIN');
      try {
        await client.query(upSql);
        await client.query('INSERT INTO pgmigrations (name, run_on) VALUES ($1, NOW())', [name]);
        await client.query('COMMIT');
        console.log(`  done: ${name}`);
      } catch (err) {
        await client.query('ROLLBACK');
        console.error(`  FAILED: ${name}\n  ${err.message}`);
        process.exit(1);
      }
    }
  } else if (direction === 'down') {
    const last = [...ran].sort().pop();
    if (!last) {
      console.log('Nothing to roll back.');
      process.exit(0);
    }

    const file = last + '.sql';
    const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8');
    const downMatch = sql.match(/--\s*Down\s*([\s\S]*?)$/i);
    if (!downMatch) {
      console.error(`No -- Down section found in ${file}`);
      process.exit(1);
    }

    const downSql = downMatch[1].trim();
    console.log(`  rollback: ${last}`);
    await client.query('BEGIN');
    try {
      await client.query(downSql);
      await client.query('DELETE FROM pgmigrations WHERE name = $1', [last]);
      await client.query('COMMIT');
      console.log(`  done: ${last}`);
    } catch (err) {
      await client.query('ROLLBACK');
      console.error(`  FAILED: ${last}\n  ${err.message}`);
      process.exit(1);
    }
  }

  await client.end();
  console.log('\nMigrations complete.');
}

run().catch(err => {
  console.error(err.message);
  process.exit(1);
});
