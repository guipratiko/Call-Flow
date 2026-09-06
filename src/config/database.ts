import { Pool } from 'pg';
import { DATABASE_CONFIG } from './constants';

let pool: Pool | null = null;

export function getPgPool(): Pool {
  if (!pool) {
    if (!DATABASE_CONFIG.POSTGRES_URI) {
      throw new Error('POSTGRES_URI não configurada no Call-Flow.');
    }
    pool = new Pool({
      connectionString: DATABASE_CONFIG.POSTGRES_URI,
      max: DATABASE_CONFIG.POOL_MAX,
    });
  }
  return pool;
}
