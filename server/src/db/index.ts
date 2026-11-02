import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { env } from '../config/env.js';
import * as schema from './schema/index.js';

// Connection pool configuration for PostgreSQL (Neon / Local)
export const client = postgres(env.DATABASE_URL, {
  max: env.NODE_ENV === 'production' ? 10 : 2,
  idle_timeout: 20,
  connect_timeout: env.NODE_ENV === 'test' ? 1 : 10,
  ssl: env.DATABASE_URL.includes('sslmode=require') ? 'require' : undefined,
});

export const db = drizzle(client, { schema });
export { schema };

// Non-blocking database availability check with circuit-breaker caching
let dbHealthState: { isAvailable: boolean; checkedAt: number } | null = null;
const DB_HEALTH_TTL_MS = env.NODE_ENV === 'test' ? 300000 : 30000; // 5m in test, 30s in dev

/**
 * Checks whether PostgreSQL is reachable and authenticated.
 * In production, always returns true to enforce direct DB access.
 * In dev/test, caches unreachable status to prevent cascading timeouts.
 */
export async function isDatabaseAvailable(): Promise<boolean> {
  if (env.NODE_ENV === 'production') return true;

  const now = Date.now();
  if (dbHealthState && now - dbHealthState.checkedAt < DB_HEALTH_TTL_MS) {
    return dbHealthState.isAvailable;
  }

  try {
    await client`SELECT 1`.simple();
    dbHealthState = { isAvailable: true, checkedAt: now };
    return true;
  } catch {
    dbHealthState = { isAvailable: false, checkedAt: now };
    return false;
  }
}

export function resetDatabaseHealthCache(): void {
  dbHealthState = null;
}

