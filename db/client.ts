import { neon } from '@neondatabase/serverless';

type NeonClient = ReturnType<typeof neon>;

let client: NeonClient | null = null;

function getDatabaseUrl() {
  const url = process.env.DATABASE_URL?.trim();
  if (!url) throw new Error('DATABASE_URL is not set.');
  return url;
}

function getClient() {
  if (!client) {
    client = neon(getDatabaseUrl(), {
      fetchOptions: { cache: 'no-store' },
    });
  }
  return client;
}

function isTransientDatabaseError(error: unknown) {
  const message = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
  return [
    'fetch failed',
    'error connecting to database',
    'network',
    'econnreset',
    'etimedout',
    'timed out',
    'socket',
    '502',
    '503',
    '504',
  ].some(fragment => message.includes(fragment));
}

function wait(milliseconds: number) {
  return new Promise(resolve => setTimeout(resolve, milliseconds));
}

export async function query(text: string, params: unknown[] = []): Promise<any[]> {
  const attempts = 3;
  let lastError: unknown;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const sql = getClient();
      const result = await sql.query(text, params);
      return result as any[];
    } catch (error) {
      lastError = error;
      console.error(`Database query attempt ${attempt}/${attempts} failed:`, error);

      if (!isTransientDatabaseError(error) || attempt === attempts) break;

      // Recreate the HTTP client before retrying in case its fetch state is stale.
      client = null;
      await wait(250 * 2 ** (attempt - 1));
    }
  }

  const detail = lastError instanceof Error ? lastError.message : String(lastError || 'Unknown database error');
  throw new Error(`Database connection failed: ${detail}`);
}
