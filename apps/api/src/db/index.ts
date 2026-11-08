import { PGlite } from '@electric-sql/pglite';
import pg from 'pg';
import { mkdirSync, readFileSync } from 'node:fs';
import { env } from '../config.js';

type Primitive = string | number | boolean | null;
export type Row = Record<string, unknown>;

interface DbClient {
  kind: 'pglite' | 'postgres';
  query<T = Row>(text: string, values?: Primitive[] | unknown[]): Promise<{ rows: T[] }>;
  exec(text: string): Promise<void>;
  close(): Promise<void>;
}

let client: DbClient | null = null;

function schemaSql(): string {
  return readFileSync(new URL('./schema.sql', import.meta.url), 'utf8');
}

export async function applySchema(): Promise<void> {
  if (!client) throw new Error('Database is not initialised');
  await client.exec(schemaSql());
}

export async function initDb(): Promise<void> {
  if (client) return;

  if (env.databaseUrl) {
    const pool = new pg.Pool({ connectionString: env.databaseUrl, max: 10 });
    const adapter: DbClient = {
      kind: 'postgres',
      async query<T>(text: string, values?: unknown[]) {
        const result = await pool.query(text, values as unknown[]);
        return { rows: result.rows as T[] };
      },
      async exec(text: string) {
        await pool.query(text);
      },
      async close() {
        await pool.end();
      },
    };
    client = adapter;
    await client.exec(schemaSql());
    console.log('[hobymine] PostgreSQL connected');
    return;
  }

  if (!env.pgliteMemory) {
    mkdirSync(env.pgliteDir, { recursive: true });
  }

  const pglite = env.pgliteMemory
    ? new PGlite()
    : new PGlite(env.pgliteDir);

  const adapter: DbClient = {
    kind: 'pglite',
    async query<T>(text: string, values?: unknown[]) {
      const result = await pglite.query<T>(text, values);
      return { rows: result.rows };
    },
    async exec(text: string) {
      await pglite.exec(text);
    },
    async close() {
      await pglite.close();
    },
  };

  client = adapter;
  await client.exec('SELECT 1');
  await client.exec(schemaSql());
  console.log(
    env.pgliteMemory
      ? '[hobymine] Embedded PostgreSQL (in-memory) ready'
      : `[hobymine] Embedded PostgreSQL ready at ${env.pgliteDir}`,
  );
}

export function sql<T = Row>(
  text: string,
  values?: unknown[],
): Promise<{ rows: T[] }> {
  if (!client) throw new Error('Database is not initialised');
  return client.query<T>(text, values);
}

export function dbKind(): 'pglite' | 'postgres' | 'none' {
  return client?.kind ?? 'none';
}

export async function closeDb(): Promise<void> {
  await client?.close();
  client = null;
}
