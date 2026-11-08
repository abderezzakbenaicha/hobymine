import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Read the repo-root .env in addition to apps/api/.env. Real environment
// variables always win, so deployment platforms can override either file.
const here = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(here, '../../../.env') });
dotenv.config();

// The embedded database lives next to the API package so the data is the same
// no matter which directory the server was started from.
const packageRoot = path.resolve(here, '..');

const trim = (value: string | undefined): string => (value ?? '').trim();

export const env = {
  nodeEnv: process.env.NODE_ENV ?? 'development',
  port: Number.parseInt(process.env.PORT ?? '4000', 10),
  // Bind all interfaces by default so a phone on the same Wi-Fi can reach the
  // API. Set HOST=127.0.0.1 to restrict it to this computer.
  host: trim(process.env.HOST) || trim(process.env.API_HOST) || '0.0.0.0',
  jwtSecret:
    trim(process.env.JWT_SECRET) ||
    'hobymine-development-secret-change-me-in-production',
  webOrigins: trim(process.env.WEB_ORIGIN)
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean),
  databaseUrl: trim(process.env.DATABASE_URL),
  pgliteDir:
    trim(process.env.PGLITE_DIR) || path.resolve(packageRoot, 'data', 'pg'),
  pgliteMemory: process.env.PGLITE_MEMORY === '1',
  isProduction: process.env.NODE_ENV === 'production',
  // Optional Supabase Storage for uploads. A cloud host has an ephemeral disk,
  // so photos and voice notes must live in a bucket; when these are unset the
  // API keeps writing to apps/api/uploads (local development).
  supabaseUrl: trim(process.env.SUPABASE_URL),
  supabaseSecretKey: trim(process.env.SUPABASE_SECRET_KEY),
  supabaseStorageBucket: trim(process.env.SUPABASE_STORAGE_BUCKET) || 'media',
};

/**
 * Hosts that are always safe for this local demo: loopback (Vite dev server),
 * Capacitor's localhost shell, and any device on the same private LAN (a phone
 * opening the web build from the PC's LAN address).
 */
const localHostname =
  /^(localhost|127\.0\.0\.1|\[?::1\]?|10\.\d{1,3}\.\d{1,3}\.\d{1,3}|192\.168\.\d{1,3}\.\d{1,3}|172\.(1[6-9]|2\d|3[0-1])\.\d{1,3}\.\d{1,3})$/i;

/**
 * The Android shell sends `Origin: https://localhost` (or `capacitor://localhost`).
 * Those origins, plus the configured web origins and private LAN origins, are
 * allowed even when WEB_ORIGIN is set to a single dev URL.
 */
export function isAllowedOrigin(origin: string | undefined): boolean {
  if (!origin) return true;
  if (env.webOrigins.length === 0) return true;
  if (env.webOrigins.includes(origin)) return true;
  try {
    const url = new URL(origin);
    if (url.protocol === 'capacitor:' || url.protocol === 'ionic:' || url.protocol === 'file:') {
      return true;
    }
    return localHostname.test(url.hostname);
  } catch {
    return false;
  }
}

if (env.isProduction && !trim(process.env.JWT_SECRET)) {
  console.warn(
    '[hobymine] WARNING: JWT_SECRET is not set. Using the development secret is unsafe in production.',
  );
}
