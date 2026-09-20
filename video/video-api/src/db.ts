import { Pool, PoolClient, QueryResultRow } from 'pg';
import { config } from './config';

export const pool = new Pool({ connectionString: config.databaseUrl });

export function query<T extends QueryResultRow = QueryResultRow>(text: string, values?: unknown[]) {
  return pool.query<T>(text, values);
}

export function getClient(): Promise<PoolClient> {
  return pool.connect();
}