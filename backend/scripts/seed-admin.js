require('dotenv').config();
const { Client } = require('pg');
const bcrypt = require('bcryptjs');

const { DB_USER, DB_PASSWORD, DB_HOST, DB_PORT, DB_NAME } = process.env;

const ADMIN = {
  email: 'garvnoor111@gmail.com',
  password: '1234567890',   // change after first login
  name: 'Garv_Sandha',
  role: 'super_admin',
};

async function run() {
  const client = new Client({
    user: DB_USER,
    password: DB_PASSWORD,
    host: DB_HOST,
    port: parseInt(DB_PORT),
    database: DB_NAME,
  });

  await client.connect();

  const existing = await client.query('SELECT id FROM users WHERE email = $1', [ADMIN.email]);
  if (existing.rows.length > 0) {
    console.log(`User ${ADMIN.email} already exists — skipping.`);
    await client.end();
    return;
  }

  const hash = await bcrypt.hash(ADMIN.password, 12);

  await client.query(
    `INSERT INTO users (email, password_hash, role, name, is_active)
     VALUES ($1, $2, $3, $4, true)`,
    [ADMIN.email, hash, ADMIN.role, ADMIN.name]
  );

  console.log('Super admin created:');
  console.log(`  email   : ${ADMIN.email}`);
  console.log(`  password: ${ADMIN.password}`);
  console.log(`  role    : ${ADMIN.role}`);

  await client.end();
}

run().catch(err => {
  console.error(err.message);
  process.exit(1);
});
