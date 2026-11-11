import { randomUUID } from 'node:crypto';
import { readFile, unlink } from 'node:fs/promises';
import path from 'node:path';
import { env } from '../config.js';
import { extensionForMime, normalizeMimeType, uploadsDir } from './uploads.js';

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
        // User media can be replaced or deleted, so keep the CDN window short;
        // a year-long cache would keep removed clips reachable after deletion.
        'Cache-Control': 'public, max-age=3600',
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

/**
 * Publishes a file that multer wrote to disk and falls back to its local URL
 * when Supabase is not configured or rejects the upload. Callers get a URL that
 * is always usable on this deployment.
 */
export async function storeUpload(file: {
  path: string;
  filename: string;
  mimetype: string;
}): Promise<string> {
  const local = `/uploads/${file.filename}`;
  if (!storageEnabled() || !file.path) return local;

  try {
    return await publishUpload(file.path, file.mimetype);
  } catch (error) {
    console.warn(
      `[hobymine] Upload stored locally because Supabase Storage failed: ${(error as Error).message}`,
    );
    return local;
  }
}

function storageKeyFromUrl(url: string): string | null {
  const prefix = `${env.supabaseUrl}/storage/v1/object/public/${storageBucket}/`;
  if (!env.supabaseUrl || !url.startsWith(prefix)) return null;
  const key = url.slice(prefix.length).split('?')[0];
  return key || null;
}

/**
 * True when `url` points at an object in this project's public bucket. Used to
 * validate media links (photos, voice introductions) without accepting an
 * arbitrary remote URL.
 */
export function isStorageUrl(url: string | null | undefined): boolean {
  return Boolean(url && storageKeyFromUrl(url));
}

/**
 * Deletes a previously uploaded file, from Supabase Storage or the local disk.
 *
 * Cleanup runs after the database row is updated, so a missing object or a
 * failed request must never fail the caller: every error is logged and
 * swallowed.
 */
export async function deleteUpload(url: string | null | undefined): Promise<void> {
  if (!url) return;

  const key = storageKeyFromUrl(url);
  if (key) {
    if (!storageEnabled()) return;
    try {
      const response = await fetch(
        `${env.supabaseUrl}/storage/v1/object/${storageBucket}`,
        {
          method: 'DELETE',
          headers: {
            apikey: env.supabaseSecretKey,
            Authorization: `Bearer ${env.supabaseSecretKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ prefixes: [key] }),
        },
      );
      if (!response.ok) {
        console.warn(
          `[hobymine] Could not delete ${key} from Supabase Storage (HTTP ${response.status}).`,
        );
      }
    } catch (error) {
      console.warn(
        `[hobymine] Supabase Storage delete failed: ${(error as Error).message}`,
      );
    }
    return;
  }

  if (url.startsWith('/uploads/')) {
    await unlink(path.join(uploadsDir, url.slice('/uploads/'.length))).catch(() => undefined);
  }
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
