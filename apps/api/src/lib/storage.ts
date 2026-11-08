import { randomUUID } from 'node:crypto';
import { readFile, unlink } from 'node:fs/promises';
import { env } from '../config.js';
import { extensionForMime, normalizeMimeType } from './uploads.js';

/**
 * Durable upload storage.
 *
 * A cloud host (Render, Fly, Railway, ...) gives the API an ephemeral disk:
 * every deploy or restart wipes it. Once `SUPABASE_URL` and a server-side
 * secret key are configured, uploaded files are published to a public Supabase
 * Storage bucket instead, and the API returns the bucket URL directly.
 *
 * With either value missing the helper returns `null` and the caller keeps the
 * local `/uploads/...` URL, so a laptop run needs no Supabase credentials.
 */

export const storageBucket = env.supabaseStorageBucket;

export function storageEnabled(): boolean {
  return Boolean(env.supabaseUrl && env.supabaseSecretKey);
}

function objectKey(mime: string): string {
  return `uploads/${randomUUID()}${extensionForMime(mime)}`;
}

function publicUrl(key: string): string {
  return `${env.supabaseUrl}/storage/v1/object/public/${storageBucket}/${key}`;
}

/**
 * Uploads a file that multer already wrote to disk and returns its public URL.
 *
 * The local copy is removed after a successful upload so the container disk
 * does not grow unbounded. Any failure is thrown; the caller decides whether to
 * fall back to the local path.
 */
export async function publishUpload(filePath: string, mimeType: string): Promise<string> {
  if (!storageEnabled()) throw new Error('Supabase Storage is not configured');

  const key = objectKey(mimeType);
  const body = await readFile(filePath);

  const response = await fetch(
    `${env.supabaseUrl}/storage/v1/object/${storageBucket}/${key}`,
    {
      method: 'POST',
      headers: {
        apikey: env.supabaseSecretKey,
        Authorization: `Bearer ${env.supabaseSecretKey}`,
        'Content-Type': normalizeMimeType(mimeType) || 'application/octet-stream',
        'Cache-Control': 'max-age=31536000',
        'x-upsert': 'false',
      },
      // Buffer is a Uint8Array, which fetch accepts as a body.
      body,
    },
  );

  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    throw new Error(
      `Supabase Storage rejected the upload (HTTP ${response.status})${
        detail ? `: ${detail.slice(0, 200)}` : ''
      }`,
    );
  }

  await unlink(filePath).catch(() => {});
  return publicUrl(key);
}

/** Creates the bucket when it does not exist yet. Safe to call on boot. */
export async function ensureStorageBucket(): Promise<void> {
  if (!storageEnabled()) return;

  try {
    const existing = await fetch(
      `${env.supabaseUrl}/storage/v1/bucket/${storageBucket}`,
      {
        headers: {
          apikey: env.supabaseSecretKey,
          Authorization: `Bearer ${env.supabaseSecretKey}`,
        },
      },
    );
    if (existing.ok) return;

    const created = await fetch(`${env.supabaseUrl}/storage/v1/bucket`, {
      method: 'POST',
      headers: {
        apikey: env.supabaseSecretKey,
        Authorization: `Bearer ${env.supabaseSecretKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        id: storageBucket,
        name: storageBucket,
        public: true,
        file_size_limit: 10 * 1024 * 1024,
      }),
    });

    if (!created.ok && created.status !== 409) {
      const detail = await created.text().catch(() => '');
      console.warn(
        `[hobymine] Could not create the "${storageBucket}" bucket (HTTP ${created.status}). ` +
          `Create it in the Supabase dashboard, or uploads will stay on local disk.${detail ? ` ${detail.slice(0, 160)}` : ''}`,
      );
    }
  } catch (error) {
    console.warn(
      `[hobymine] Supabase Storage check failed: ${(error as Error).message}`,
    );
  }
}
