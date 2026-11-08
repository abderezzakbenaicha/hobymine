#!/usr/bin/env node
/**
 * Copy the local PGlite database into Supabase Postgres.
 *
 * Idempotent: uses `ON CONFLICT DO NOTHING`, so re-running only adds rows that
 * are missing. Reads the local engine directly (the API must be stopped) and
 * writes through DATABASE_URL. Verifies row counts afterwards.
 *
 * Usage: npm run migrate:supabase
 */
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';
import pg from 'pg';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

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

const databaseUrl = (process.env.DATABASE_URL || '').trim();
if (!databaseUrl) {
  console.error('DATABASE_URL is not set. Point it at the Supabase pooler first.');
  process.exit(1);
}

const localDir = process.env.PGLITE_DIR
  ? resolve(process.env.PGLITE_DIR)
  : resolve(root, 'apps/api/data/pg');

// Parents before children so foreign keys are satisfied.
const TABLES = [
  'users',
  'preferences',
  'swipes',
  'matches',
  'messages',
  'blocks',
  'reports',
  'verifications',
  'call_usage',
  'video_usage',
  'like_usage',
  'message_reactions',
  'password_resets',
  'email_verifications',
  'profile_views',
  'stories',
  'story_likes',
  'story_views',
];

const quote = (name) => `"${name.replace(/"/g, '""')}"`;

function redact(value) {
  return value.replace(/:\/\/([^:@/]+):[^@/]+@/, '://$1:****@');
}

async function main() {
  console.log(`\nLocal  : ${localDir}`);
  console.log(`Remote : ${redact(databaseUrl)}\n`);

  const local = new PGlite(localDir);
  const remote = new pg.Client({
    connectionString: databaseUrl,
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 15_000,
  });

  await local.waitReady;
  await remote.connect();

  const summary = [];

  try {
    await remote.query("SET statement_timeout = '180s'");
    await remote.query('BEGIN');

    for (const table of TABLES) {
      const columns = await remote.query(
        `SELECT column_name, data_type
           FROM information_schema.columns
          WHERE table_schema = 'public' AND table_name = $1
          ORDER BY ordinal_position`,
        [table],
      );

      if (columns.rows.length === 0) {
        throw new Error(`Supabase has no public.${table}; run npm run db:supabase first.`);
      }

      const names = columns.rows.map((row) => row.column_name);
      const jsonb = new Set(
        columns.rows
          .filter((row) => row.data_type === 'jsonb' || row.data_type === 'json')
          .map((row) => row.column_name),
      );
      const columnList = names.map(quote).join(', ');

      const localRows = await local.query(
        `SELECT ${columnList} FROM ${quote(table)}`,
      );
      const rows = localRows.rows;
      if (rows.length === 0) {
        summary.push({ table, local: 0, inserted: 0 });
        continue;
      }

      const batchSize = Math.max(1, Math.min(200, Math.floor(30_000 / names.length)));
      let inserted = 0;

      for (let start = 0; start < rows.length; start += batchSize) {
        const batch = rows.slice(start, start + batchSize);
        const values = [];
        const placeholders = batch.map((row, rowIndex) => {
          const slots = names.map((name, columnIndex) => {
            const value = row[name] ?? null;
            values.push(
              jsonb.has(name) && value !== null ? JSON.stringify(value) : value,
            );
            return `$${rowIndex * names.length + columnIndex + 1}`;
          });
          return `(${slots.join(', ')})`;
        });

        const result = await remote.query(
          `INSERT INTO public.${quote(table)} (${columnList})
           VALUES ${placeholders.join(', ')}
           ON CONFLICT DO NOTHING`,
          values,
        );
        inserted += result.rowCount ?? 0;
      }

      summary.push({ table, local: rows.length, inserted });
    }

    await remote.query('COMMIT');

    const counts = [];
    for (const { table } of summary) {
      const remoteCount = await remote.query(
        `SELECT count(*)::int AS n FROM public.${quote(table)}`,
      );
      counts.push({ table, remote: remoteCount.rows[0].n });
    }

    console.log('Table                     local   inserted   remote');
    console.log('--------------------------------------------------------');
    let total = 0;
    for (const row of summary) {
      const remoteCount = counts.find((c) => c.table === row.table)?.remote ?? 0;
      total += row.inserted;
      console.log(
        `${row.table.padEnd(24)} ${String(row.local).padStart(6)} ` +
          `${String(row.inserted).padStart(10)} ${String(remoteCount).padStart(8)}`,
      );
    }
    console.log('--------------------------------------------------------');
    console.log(`Inserted ${total} row(s) into Supabase.\n`);
  } catch (error) {
    await remote.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    await remote.end().catch(() => {});
    await local.close().catch(() => {});
  }
}

main().catch((error) => {
  console.error(`\nMigration failed: ${error.message}\n`);
  process.exit(1);
});
