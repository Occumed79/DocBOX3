import { Pool, type PoolConfig, type QueryResultRow } from 'pg';

const pools = new Map<string, Pool>();

function databaseCandidates() {
  const raw = process.env.DATABASE_URL?.trim();
  if (!raw) throw new Error('DATABASE_URL is not set.');

  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    throw new Error('DATABASE_URL is not a valid PostgreSQL connection string.');
  }

  // node-postgres handles TLS itself. Removing these URL flags avoids
  // channel-binding/fetch compatibility issues seen on Render.
  parsed.searchParams.delete('channel_binding');
  parsed.searchParams.delete('sslmode');

  const candidates = [parsed.toString()];
  const host = parsed.hostname;

  // Neon supplies pooled and direct hosts. Try the counterpart when a
  // transient network or pooler error occurs.
  if (host.includes('-pooler.')) {
    const direct = new URL(parsed.toString());
    direct.hostname = host.replace('-pooler.', '.');
    candidates.push(direct.toString());
  } else if (host.includes('.neon.tech')) {
    const pooled = new URL(parsed.toString());
    const firstDot = host.indexOf('.');
    pooled.hostname = `${host.slice(0, firstDot)}-pooler${host.slice(firstDot)}`;
    candidates.push(pooled.toString());
  }

  return [...new Set(candidates)];
}

function poolFor(connectionString: string) {
  const existing = pools.get(connectionString);
  if (existing) return existing;

  const hostname = new URL(connectionString).hostname;
  const local = hostname === 'localhost' || hostname === '127.0.0.1';
  const config: PoolConfig = {
    connectionString,
    max: 5,
    min: 0,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 12_000,
    allowExitOnIdle: true,
    ssl: local ? undefined : { rejectUnauthorized: false },
  };

  const pool = new Pool(config);
  pool.on('error', error => {
    console.error('Idle PostgreSQL client error:', error);
    pools.delete(connectionString);
  });
  pools.set(connectionString, pool);
  return pool;
}

function isTransient(error: unknown) {
  const message = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
  return [
    'econnreset',
    'econnrefused',
    'enotfound',
    'etimedout',
    'timeout',
    'connection terminated',
    'connection closed',
    'server closed the connection',
    'socket',
    'network',
    'too many clients',
    'remaining connection slots',
    '57p01',
    '57p02',
    '57p03',
  ].some(fragment => message.includes(fragment));
}

function wait(milliseconds: number) {
  return new Promise(resolve => setTimeout(resolve, milliseconds));
}

export async function query<T extends QueryResultRow = any>(text: string, params: unknown[] = []): Promise<T[]> {
  const candidates = databaseCandidates();
  let lastError: unknown;

  for (let round = 0; round < 2; round += 1) {
    for (const connectionString of candidates) {
      const pool = poolFor(connectionString);
      try {
        const result = await pool.query<T>(text, params);
        return result.rows;
      } catch (error) {
        lastError = error;
        const host = new URL(connectionString).hostname;
        console.error(`PostgreSQL query failed via ${host}:`, error);

        if (!isTransient(error)) {
          throw error;
        }

        pools.delete(connectionString);
        await pool.end().catch(() => undefined);
      }
    }

    if (round === 0) await wait(500);
  }

  const detail = lastError instanceof Error ? lastError.message : String(lastError || 'Unknown database error');
  throw new Error(`Database connection failed: ${detail}`);
}
