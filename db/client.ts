import { neon } from '@neondatabase/serverless';

let _sql: ReturnType<typeof neon> | null = null;

function getClient() {
  if (!_sql) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error('DATABASE_URL is not set.');
    _sql = neon(url);
  }
  return _sql;
}

export async function query(text: string, params?: any[]): Promise<any[]> {
  const sql = getClient();
  const result = params?.length ? await sql(text, params) : await sql(text);
  return result as any[];
}
