const { neon } = require('@neondatabase/serverless');
const fs = require('fs');
const path = require('path');

async function main() {
  const databaseUrl = process.env.DATABASE_URL?.trim();
  if (!databaseUrl) throw new Error('DATABASE_URL is not set.');

  const sql = neon(databaseUrl, {
    fetchOptions: { cache: 'no-store' },
  });
  const schema = fs.readFileSync(path.join(__dirname, '../db/schema.sql'), 'utf-8');
  const statements = schema.split(';').map(statement => statement.trim()).filter(Boolean);

  for (const statement of statements) {
    try {
      await sql.query(statement);
      console.log('✓', statement.slice(0, 60).replace(/\n/g, ' '));
    } catch (error) {
      console.warn('⚠', error.message?.slice(0, 120));
    }
  }

  console.log('\nMigration complete.');
}

main().catch(error => {
  console.error('Migration failed:', error);
  process.exitCode = 1;
});
