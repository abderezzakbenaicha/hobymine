import { useSyncExternalStore } from 'react';

/**
 * Where the app looks for the HobyMine API.
 *
 * Three layers, highest priority first:
 *
 * 1. `localStorage["hobymine.apiBase"]` - set from the in-app server settings.
 *    This is the escape hatch that works on an installed APK without rebuilding:
 *    if the PC's LAN address changes, the user enters the new one once.
 * 2. `VITE_API_URL` - baked in at build time. This is the shipping default.
 * 3. Native fallback / same origin - a packaged Android build serves the assets
 *    from `https://localhost`, so it needs an absolute API address. The web
 *    build keeps relative URLs so the Vite proxy and same-origin deploys work.
 *
 * The value is read through `getApiBase()` at request time (never captured in a
 * module constant) so changing it takes effect immediately.
 */

export const API_BASE_STORAGE_KEY = 'hobymine.apiBase';

/**
 * Default cloud address baked into the APK. It points at the Render service
 * declared in `render.yaml`; users can change it in the app without a rebuild.
 * Keep in sync with `apps/web/.env.production`.
 */
export const NATIVE_FALLBACK_BASE = 'https://hobymine-api.onrender.com';

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

/** The build-time default, exposed so the settings screen can show/restore it. */
export const defaultApiBase: string =
  normalizeApiBase(import.meta.env.VITE_API_URL ?? '') ||
  (isNativeShell ? NATIVE_FALLBACK_BASE : '');

function readStoredOverride(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    const stored = window.localStorage.getItem(API_BASE_STORAGE_KEY);
    if (!stored) return null;
    return normalizeApiBase(stored) || null;
  } catch {
    // Private browsing can refuse storage; fall back to the build default.
    return null;
  }
}

let storedOverride: string | null = readStoredOverride();
let currentBase: string = storedOverride ?? defaultApiBase;

const listeners = new Set<() => void>();

function notify(): void {
  for (const listener of listeners) listener();
}

/**
 * Subscribes to changes of the effective API base. Used by React, by the
 * socket client (to reconnect to the new host) and by the API client (to reset
 * its connection status).
 */
export function subscribeApiBase(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** The base URL every request should use right now. `''` means same origin. */
export function getApiBase(): string {
  return currentBase;
}

/** The address the app was built with (ignoring any runtime override). */
export function getDefaultApiBase(): string {
  return defaultApiBase;
}

/** The user-selected override, or `null` when the build default is in use. */
export function getApiBaseOverride(): string | null {
  return storedOverride;
}

/**
 * Applies a new API base. Pass `null` (or an empty string) to go back to the
 * build default. An invalid address is rejected so a typo cannot brick the app.
 */
export function setApiBaseOverride(value: string | null): boolean {
  if (value === null || value.trim() === '') {
    storedOverride = null;
    currentBase = defaultApiBase;
  } else {
    const normalized = normalizeApiBase(value);
    if (!normalized) return false;
    storedOverride = normalized;
    currentBase = normalized;
  }

  if (typeof window !== 'undefined') {
    try {
      if (storedOverride) window.localStorage.setItem(API_BASE_STORAGE_KEY, storedOverride);
      else window.localStorage.removeItem(API_BASE_STORAGE_KEY);
    } catch {
      // The in-memory value still applies for this session.
    }
  }

  notify();
  return true;
}

/**
 * Previously reachable server addresses, most recent first.
 *
 * This is what makes the app survive a changing LAN address without the user
 * having to type anything: when the current address stops answering, the app
 * probes these known-good addresses and switches to one that still works.
 * Only addresses that actually answered are ever recorded, so a typo never
 * ends up in the failover list.
 */
export const API_BASE_HISTORY_KEY = 'hobymine.apiBaseHistory';

const MAX_REMEMBERED_BASES = 8;

function readStoredHistory(): string[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(API_BASE_HISTORY_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const seen = new Set<string>();
    const result: string[] = [];
    for (const entry of parsed) {
      if (typeof entry !== 'string') continue;
      const normalized = normalizeApiBase(entry);
      // `''` means "same origin" and is not useful as a failover target.
      if (!normalized || seen.has(normalized)) continue;
      seen.add(normalized);
      result.push(normalized);
      if (result.length >= MAX_REMEMBERED_BASES) break;
    }
    return result;
  } catch {
    return [];
  }
}

let knownBases: string[] = readStoredHistory();
const historyListeners = new Set<() => void>();

function writeHistory(): void {
  for (const listener of historyListeners) listener();
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(API_BASE_HISTORY_KEY, JSON.stringify(knownBases));
  } catch {
    // Storage can be unavailable (private mode); the in-memory list still works.
  }
}

/** Known-good bases, most recently confirmed first. */
export function getApiBaseHistory(): string[] {
  return knownBases;
}

export function subscribeApiBaseHistory(listener: () => void): () => void {
  historyListeners.add(listener);
  return () => {
    historyListeners.delete(listener);
  };
}

/**
 * Records an address that just answered successfully. Called by the API client
 * whenever a request succeeds, so the list reflects reality rather than what
 * the user typed.
 */
export function rememberApiBase(base: string | null | undefined): void {
  const normalized = normalizeApiBase(base);
  if (!normalized) return;
  if (knownBases[0] === normalized) return;

  const next = [normalized, ...knownBases.filter((entry) => entry !== normalized)].slice(
    0,
    MAX_REMEMBERED_BASES,
  );
  if (next.length === knownBases.length && next.every((entry, i) => entry === knownBases[i])) {
    return;
  }
  knownBases = next;
  writeHistory();
}

/** Drops an address from the failover list (e.g. a machine that moved away). */
export function forgetApiBase(base: string): void {
  const normalized = normalizeApiBase(base);
  if (!normalized) return;
  const next = knownBases.filter((entry) => entry !== normalized);
  if (next.length === knownBases.length) return;
  knownBases = next;
  writeHistory();
}

// Keep two tabs (or an installed app and a browser preview) in sync.
if (typeof window !== 'undefined') {
  window.addEventListener('storage', (event) => {
    if (event.key === API_BASE_HISTORY_KEY) {
      knownBases = readStoredHistory();
      for (const listener of historyListeners) listener();
      return;
    }
    if (event.key !== API_BASE_STORAGE_KEY) return;
    storedOverride = readStoredOverride();
    currentBase = storedOverride ?? defaultApiBase;
    notify();
  });
}

/** React binding for the effective API base. */
export function useApiBase(): string {
  return useSyncExternalStore(subscribeApiBase, getApiBase, getApiBase);
}

/** Human label for a base, e.g. `192.168.1.33:4000` or "this site". */
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
