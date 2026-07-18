const { Client } = require('pg');
const fs = require('fs');
const path = require('path');

function normalizedDatabaseUrl() {
  const raw = process.env.DATABASE_URL?.trim();
  if (!raw) throw new Error('DATABASE_URL is not set.');
  const parsed = new URL(raw);
  parsed.searchParams.delete('channel_binding');
  parsed.searchParams.delete('sslmode');
  return parsed.toString();
}

async function main() {
  const connectionString = normalizedDatabaseUrl();
  const hostname = new URL(connectionString).hostname;
  const local = hostname === 'localhost' || hostname === '127.0.0.1';
  const client = new Client({
    connectionString,
    connectionTimeoutMillis: 15_000,
    ssl: local ? undefined : { rejectUnauthorized: false },
  });

  await client.connect();
  try {
    const schema = fs.readFileSync(path.join(__dirname, '../db/schema.sql'), 'utf-8');
    const statements = schema.split(';').map(statement => statement.trim()).filter(Boolean);

    for (const statement of statements) {
      try {
        await client.query(statement);
        console.log('✓', statement.slice(0, 60).replace(/\n/g, ' '));
      } catch (error) {
        console.warn('⚠', error.message?.slice(0, 120));
      }
    }

    console.log('\nMigration complete.');
  } finally {
    await client.end();
  }
}

main().catch(error => {
  console.error('Migration failed:', error);
  process.exitCode = 1;
});
