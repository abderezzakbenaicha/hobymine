#!/usr/bin/env node
/**
 * Copy local uploads into the Supabase Storage bucket and rewrite every media
 * reference in Postgres from `/uploads/<file>` to the bucket's public URL.
 *
 * Run it once before switching the APK to the cloud API. Safe to re-run: an
 * object that already exists is skipped, and rows that already point at the
 * bucket are left alone.
 *
 * Usage: npm run migrate:uploads
 */
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
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

const supabaseUrl = (process.env.SUPABASE_URL || '').trim().replace(/\/+$/, '');
const secretKey = (process.env.SUPABASE_SECRET_KEY || '').trim();
const bucket = (process.env.SUPABASE_STORAGE_BUCKET || 'media').trim();
const databaseUrl = (process.env.DATABASE_URL || '').trim();
const uploadsDir = resolve(root, 'apps/api/uploads');

if (!supabaseUrl || !secretKey) {
  console.error(
    'SUPABASE_URL and SUPABASE_SECRET_KEY are required.\n' +
      'Create a secret key in Supabase Dashboard -> Project Settings -> API Keys.',
  );
  process.exit(1);
}
if (!databaseUrl) {
  console.error('DATABASE_URL is not set.');
  process.exit(1);
}

const publicBase = `${supabaseUrl}/storage/v1/object/public/${bucket}`;

function contentType(name) {
  const ext = name.slice(name.lastIndexOf('.')).toLowerCase();
  const map = {
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.webp': 'image/webp',
    '.gif': 'image/gif',
    '.bmp': 'image/bmp',
    '.avif': 'image/avif',
    '.heic': 'image/heic',
    '.heif': 'image/heif',
    '.webm': 'audio/webm',
    '.ogg': 'audio/ogg',
    '.mp3': 'audio/mpeg',
    '.wav': 'audio/wav',
    '.m4a': 'audio/mp4',
    '.pdf': 'application/pdf',
    '.txt': 'text/plain',
    '.csv': 'text/csv',
    '.rtf': 'application/rtf',
    '.json': 'application/json',
    '.doc': 'application/msword',
    '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    '.xls': 'application/vnd.ms-excel',
    '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    '.ppt': 'application/vnd.ms-powerpoint',
    '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    '.odt': 'application/vnd.oasis.opendocument.text',
    '.ods': 'application/vnd.oasis.opendocument.spreadsheet',
    '.zip': 'application/zip',
    '.rar': 'application/vnd.rar',
    '.7z': 'application/x-7z-compressed',
  };
  return map[ext] || 'application/octet-stream';
}

async function uploadFile(name) {
  const key = `uploads/${name}`;
  const body = readFileSync(join(uploadsDir, name));
  const response = await fetch(`${supabaseUrl}/storage/v1/object/${bucket}/${key}`, {
    method: 'POST',
    headers: {
      apikey: secretKey,
      Authorization: `Bearer ${secretKey}`,
      'Content-Type': contentType(name),
      'Cache-Control': 'max-age=31536000',
      'x-upsert': 'false',
    },
    body,
  });
  if (response.ok) return 'uploaded';
  if (response.status === 409) return 'exists';
  const detail = await response.text().catch(() => '');
  throw new Error(`${name}: HTTP ${response.status} ${detail.slice(0, 160)}`);
}

async function main() {
  console.log(`\nBucket : ${bucket} @ ${supabaseUrl}`);

  // 1. Upload every file. Only referenced files strictly need it, but copying
  //    all of them keeps old chat attachments working too.
  let uploaded = 0;
  let skipped = 0;
  const failed = [];
  if (existsSync(uploadsDir)) {
    for (const name of readdirSync(uploadsDir)) {
      const full = join(uploadsDir, name);
      if (!statSync(full).isFile()) continue;
      try {
        const result = await uploadFile(name);
        if (result === 'uploaded') uploaded += 1;
        else skipped += 1;
      } catch (error) {
        failed.push(error.message);
      }
    }
  }
  console.log(`Files  : ${uploaded} uploaded, ${skipped} already present, ${failed.length} failed`);
  for (const message of failed.slice(0, 10)) console.log(`  ! ${message}`);

  // 2. Rewrite stored paths in every column that can hold an upload.
  const client = new pg.Client({
    connectionString: databaseUrl,
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 15_000,
  });
  await client.connect();

  const rewrite = (value) => {
    if (typeof value !== 'string' || !value.startsWith('/uploads/')) return value;
    // Objects live under the `uploads/` prefix inside the bucket, so the path
    // is appended as-is: /uploads/x.jpg -> .../media/uploads/x.jpg
    return `${publicBase}${value}`;
  };
  const rewriteArray = (values) =>
    Array.isArray(values) ? values.map(rewrite) : values;

  let rewritten = 0;

  try {
    await client.query('BEGIN');

    const users = await client.query(
      'SELECT id, photos, voice_intro_url FROM users',
    );
    for (const row of users.rows) {
      const photos = rewriteArray(row.photos);
      const voice = rewrite(row.voice_intro_url);
      const changed =
        JSON.stringify(photos) !== JSON.stringify(row.photos) ||
        voice !== row.voice_intro_url;
      if (!changed) continue;
      await client.query(
        'UPDATE users SET photos = $2, voice_intro_url = $3 WHERE id = $1',
        [row.id, JSON.stringify(photos), voice],
      );
      rewritten += 1;
    }

    const messageTables = [
      ['messages', 'media_url'],
      ['messages', 'story_media_url'],
      ['stories', 'media_url'],
      ['verifications', 'selfie_url'],
    ];
    for (const [table, column] of messageTables) {
      const rows = await client.query(
        `SELECT id, ${column} AS value FROM ${table} WHERE ${column} LIKE '/uploads/%'`,
      );
      for (const row of rows.rows) {
        await client.query(
          `UPDATE ${table} SET ${column} = $2 WHERE id = $1`,
          [row.id, rewrite(row.value)],
        );
        rewritten += 1;
      }
    }

    await client.query('COMMIT');
    console.log(`Rows   : ${rewritten} media reference(s) rewritten`);
    console.log(`\nPublic URL prefix: ${publicBase}/\n`);
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    await client.end().catch(() => {});
  }
}

main().catch((error) => {
  console.error(`\nUpload migration failed: ${error.message}\n`);
  process.exit(1);
});
