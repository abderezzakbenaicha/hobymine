/**
 * Where the app looks for the HobyMine API.
 *
 * The production backend is permanent, so the address is decided at build time
 * and there is no in-app override any more:
 *
 * 1. `VITE_API_URL` - baked in at build time. This is the shipping default.
 * 2. Native fallback - a packaged Android build serves the assets from
 *    `https://localhost`, so it needs an absolute API address.
 * 3. Same origin - the web build keeps relative URLs so the Vite proxy and
 *    same-origin deploys work.
 *
 * Earlier builds let people type a LAN address. Those values are discarded on
 * launch so a stale development host can never hijack the production app.
 */

/** Build-time default address baked into the APK (see `DEPLOY.md`). */
const NATIVE_FALLBACK_BASE = 'https://hobymine-api-production.up.railway.app';

/** Storage keys used by the old, removed server-address settings screen. */
const LEGACY_BASE_KEY = 'hobymine.apiBase';
const LEGACY_HISTORY_KEY = 'hobymine.apiBaseHistory';

const isNativeShell =
  typeof window !== 'undefined' &&
  (window.location.protocol === 'capacitor:' ||
    (window.location.hostname === 'localhost' && window.location.protocol === 'https:'));

/**
 * Validates and canonicalises a server address.
 *
 * - Accepts `http://` and `https://` URLs, with or without a path prefix.
 * - Adds `http://` when the scheme is missing (people type `192.168.1.33:4000`).
 * - Drops trailing slashes, query strings and fragments, so callers can always
 *   concatenate `"/api/..."`.
 * - Returns `''` for an intentionally empty (same-origin) value.
 * - Returns `null` when the value is not a usable HTTP(S) address.
 */
export function normalizeApiBase(value: string | null | undefined): string | null {
  const raw = (value ?? '').trim();
  if (!raw) return '';

  let candidate = raw;
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(candidate)) candidate = `http://${candidate}`;

  let url: URL;
  try {
    url = new URL(candidate);
  } catch {
    return null;
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
  if (!url.hostname) return null;

  const path = url.pathname.replace(/\/+$/, '');
  return `${url.origin}${path}`;
}

/** The base URL every request should use. `''` means same origin. */
export const defaultApiBase: string =
  normalizeApiBase(import.meta.env.VITE_API_URL ?? '') ||
  (isNativeShell ? NATIVE_FALLBACK_BASE : '');

// Drop overrides saved by builds that still had the server settings screen.
if (typeof window !== 'undefined') {
  try {
    window.localStorage.removeItem(LEGACY_BASE_KEY);
    window.localStorage.removeItem(LEGACY_HISTORY_KEY);
  } catch {
    // Private browsing can refuse storage; nothing else depends on it.
  }
}

/** The base URL every request should use right now. `''` means same origin. */
export function getApiBase(): string {
  return defaultApiBase;
}

/**
 * Kept for the socket client and the API client, which reset their connection
 * state when the base changes. The address is fixed now, so it never fires.
 */
export function subscribeApiBase(_listener: () => void): () => void {
  return () => {};
}

/** React binding for the effective API base. */
export function useApiBase(): string {
  return getApiBase();
}

/** Human label for a base, e.g. `hobymine-api-production.up.railway.app`. */
export function apiBaseLabel(base: string = getApiBase()): string {
  if (!base) {
    return typeof window !== 'undefined' ? window.location.host : 'this site';
  }
  try {
    return new URL(base).host || base;
  } catch {
    return base;
  }
}

export { isNativeShell };
