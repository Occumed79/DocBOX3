const { neon } = require('@neondatabase/serverless');
const fs = require('fs');
const path = require('path');

async function main() {
  const sql = neon(process.env.DATABASE_URL);
  const schema = fs.readFileSync(path.join(__dirname, '../db/schema.sql'), 'utf-8');
  // Split on ; and run each statement
  const statements = schema.split(';').map(s => s.trim()).filter(Boolean);
  for (const stmt of statements) {
    try {
      await sql(stmt);
      console.log('✓', stmt.slice(0, 60).replace(/\n/g, ' '));
    } catch (e) {
      console.warn('⚠', e.message?.slice(0, 80));
    }
  }
  console.log('\nMigration complete.');
}
main().catch(console.error);
