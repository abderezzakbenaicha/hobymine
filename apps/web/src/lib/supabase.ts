import { createClient, type SupabaseClient } from '@supabase/supabase-js';

/**
 * HobyMine's Supabase browser client.
 *
 * Only the *publishable* key may live here. Vite inlines every `VITE_*`
 * variable into the shipped JavaScript, so a secret / `service_role` key must
 * never be assigned to one: it would give anyone who opens the app full
 * database access and bypass Row Level Security.
 */

const rawUrl = (import.meta.env.VITE_SUPABASE_URL ?? '').trim();
const rawKey = (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? '').trim();

/** A key that must never be bundled into the web app or the APK. */
function looksLikeSecretKey(key: string): boolean {
  return key.startsWith('sb_secret_') || key.startsWith('service_role');
}

if (rawKey && looksLikeSecretKey(rawKey)) {
  throw new Error(
    '[supabase] VITE_SUPABASE_PUBLISHABLE_KEY contains a secret key. ' +
      'Refusing to start: secret keys bypass Row Level Security and must only ' +
      'be used by the server (SUPABASE_SECRET_KEY in the API environment).',
  );
}

export const supabaseUrl = rawUrl;
export const supabasePublishableKey = rawKey;

/** True when both values are present, so callers can degrade gracefully. */
export const isSupabaseConfigured: boolean = Boolean(rawUrl && rawKey);

let client: SupabaseClient | null = null;

/**
 * The singleton Supabase client, or `null` when the app was built without
 * Supabase credentials. Call `requireSupabase()` where a client is mandatory.
 */
export const supabase: SupabaseClient | null = isSupabaseConfigured
  ? createClient(rawUrl, rawKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        storageKey: 'hobymine.supabase.auth',
      },
      realtime: {
        // Chat and stories are small, high-frequency events.
        params: { eventsPerSecond: 10 },
      },
      global: {
        headers: { 'x-application-name': 'hobymine-web' },
      },
    })
  : null;

export function requireSupabase(): SupabaseClient {
  if (!client) {
    throw new Error(
      '[supabase] Missing VITE_SUPABASE_URL or VITE_SUPABASE_PUBLISHABLE_KEY. ' +
        'Add them to apps/web/.env.local (see apps/web/.env.example).',
    );
  }
  return client;
}
