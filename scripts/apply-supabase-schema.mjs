#!/usr/bin/env node
/**
 * Apply the HobyMine schema to Supabase.
 *
 * Two credential paths, in order:
 *   1. SUPABASE_DB_URL  - a Postgres connection string (Session pooler).
 *      Or SUPABASE_DB_PASSWORD, which is combined with the known project host.
 *   2. SUPABASE_ACCESS_TOKEN - a Supabase personal access token (`sbp_...`),
 *      which uses the Management API.
 *
 * An API key (`sb_publishable_` / `sb_secret_`) cannot run DDL, so one of the
 * above is required. Secrets are never printed.
 *
 * Usage: npm run db:supabase
 */
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const migrationPath = resolve(
  root,
  'supabase/migrations/20261108000000_hobymine_schema.sql',
);
const projectUrl = 'https://orwsthtoopdjmtoojkhb.supabase.co';
const projectRef = 'orwsthtoopdjmtoojkhb';
const defaultPoolerHost = 'aws-1-eu-central-1.pooler.supabase.com';

function loadEnvFile(path) {
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
    const match = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/.exec(line);
    if (!match) continue;
    const [, name, rawValue] = match;
    if (process.env[name] !== undefined) continue;
    let value = rawValue.trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    process.env[name] = value;
  }
}

loadEnvFile(resolve(root, '.env'));
loadEnvFile(resolve(root, 'apps/web/.env.local'));

const dbUrl = (process.env.SUPABASE_DB_URL || process.env.DATABASE_URL || '').trim();
const dbPassword = (process.env.SUPABASE_DB_PASSWORD || '').trim();
const accessToken = (process.env.SUPABASE_ACCESS_TOKEN || '').trim();
const poolerHost = (process.env.SUPABASE_DB_HOST || defaultPoolerHost).trim();
const supabaseUrl = (process.env.SUPABASE_URL || projectUrl).replace(/\/+$/, '');
const ref = /https:\/\/([a-z0-9-]+)\.supabase\.co/i.exec(supabaseUrl)?.[1] ?? projectRef;

function redact(value) {
  return value.replace(/:\/\/([^:@/]+):[^@/]+@/, '://$1:****@');
}

const migration = readFileSync(migrationPath, 'utf8');

async function applyWithPostgres(connectionString) {
  const client = new pg.Client({
    connectionString,
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 15_000,
  });
  await client.connect();
  try {
    await client.query("SET statement_timeout = '180s'");
    await client.query('BEGIN');
    await client.query(migration);
    await client.query('COMMIT');

    const tables = await client.query(
      `SELECT tablename
         FROM pg_tables
        WHERE schemaname = 'public'
        ORDER BY tablename`,
    );
    return tables.rows.map((row) => row.tablename);
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    await client.end().catch(() => {});
  }
}

async function applyWithManagementApi(token) {
  const response = await fetch(
    `https://api.supabase.com/v1/projects/${ref}/database/query`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ query: migration }),
    },
  );
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`Management API HTTP ${response.status}: ${text.slice(0, 400)}`);
  }
  return null;
}

async function verifyWithPublishableKey() {
  const key =
    process.env.SUPABASE_PUBLISHABLE_KEY ||
    process.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
    '';
  if (!key) return null;
  const response = await fetch(`${supabaseUrl}/rest/v1/users?select=id&limit=1`, {
    headers: { apikey: key, Authorization: `Bearer ${key}` },
  });
  return { status: response.status };
}

async function main() {
  console.log('\nHobyMine -> Supabase schema\n');

  let tables = null;
  if (dbUrl || dbPassword) {
    const connectionString =
      dbUrl ||
      `postgresql://postgres.${ref}:${encodeURIComponent(dbPassword)}@${poolerHost}:5432/postgres`;
    console.log(`Using Postgres: ${redact(connectionString)}`);
    tables = await applyWithPostgres(connectionString);
  } else if (accessToken) {
    console.log('Using the Supabase Management API');
    await applyWithManagementApi(accessToken);
  } else {
    console.error(
      [
        'No database credential found, so the tables cannot be created.',
        '',
        'Add ONE of these to the repo-root .env:',
        '',
        '  SUPABASE_DB_PASSWORD=<database password>',
        '    from Supabase Dashboard -> Project Settings -> Database.',
        '',
        '  SUPABASE_DB_URL=postgresql://postgres.<ref>:<password>@<host>:5432/postgres',
        '    from Supabase Dashboard -> Connect -> Session pooler.',
        '',
        '  SUPABASE_ACCESS_TOKEN=sbp_<personal access token>',
        '    from https://supabase.com/dashboard/account/tokens',
        '',
        'The publishable and secret API keys cannot run DDL.',
      ].join('\n'),
    );
    process.exit(1);
  }

  console.log('Schema applied successfully.\n');
  if (tables) {
    console.log(`Public tables (${tables.length}):`);
    for (const table of tables) console.log(`  - ${table}`);
  }

  const check = await verifyWithPublishableKey().catch(() => null);
  if (check) {
    console.log(
      check.status === 401 || check.status === 403
        ? `\nRLS is active: the publishable key gets HTTP ${check.status} (expected).`
        : `\nPublishable-key read of users: HTTP ${check.status}.`,
    );
  }
  console.log('\nRun `npm run test:supabase` to re-test the connection.\n');
}

main().catch((error) => {
  console.error(`\nFailed: ${error.message}\n`);
  process.exit(1);
});
