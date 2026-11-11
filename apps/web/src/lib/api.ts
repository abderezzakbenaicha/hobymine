import { useSyncExternalStore } from 'react';
import type { ApiErrorBody } from '../types';
import { getApiBase, normalizeApiBase, subscribeApiBase } from './apiConfig';

// Maximum time (ms) to wait for an API response before failing. This prevents
// the sign-in (and other) spinners from spinning forever when the device
// cannot reach the backend (wrong IP, server down, no network).
const DEFAULT_TIMEOUT_MS = 15_000;

// Uploads are much slower than JSON requests over Wi-Fi, so they get longer.
const UPLOAD_TIMEOUT_MS = 60_000;

// The health probe is deliberately impatient: it drives the "offline" banner
// and the automatic retry loop, so a slow probe should fail fast.
const PROBE_TIMEOUT_MS = 6_000;

// Idempotent requests are retried a few times with growing delays before the
// app reports the backend as unreachable. Mutating requests (POST/PATCH/PUT/
// DELETE) are never retried automatically: a retried "send message" could
// create duplicates.
const RETRY_DELAYS_MS = [350, 900, 2000];
const IDEMPOTENT_METHODS = new Set(['GET', 'HEAD']);

export type ConnectionStatus = 'unknown' | 'online' | 'offline';

export interface ConnectionState {
  status: ConnectionStatus;
  /** The base the status refers to. */
  base: string;
  /** Epoch ms of the last completed request/probe, or null. */
  checkedAt: number | null;
  lastError: string | null;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

let connection: ConnectionState = {
  status: 'unknown',
  base: getApiBase(),
  checkedAt: null,
  lastError: null,
};

const connectionListeners = new Set<() => void>();

function setConnection(patch: Partial<ConnectionState>): void {
  connection = { ...connection, ...patch };
  for (const listener of connectionListeners) listener();
}

function markOnline(base: string): void {
  // A response from a base the user has since replaced says nothing about the
  // current one; ignore it.
  if (base !== getApiBase()) return;
  setConnection({ status: 'online', base, checkedAt: Date.now(), lastError: null });
}

function markOffline(base: string, message: string): void {
  if (base !== getApiBase()) return;
  setConnection({ status: 'offline', base, checkedAt: Date.now(), lastError: message });
}

/** Current reachability of the backend, as learned from requests and probes. */
export function getConnectionState(): ConnectionState {
  return connection;
}

export function subscribeConnection(listener: () => void): () => void {
  connectionListeners.add(listener);
  return () => {
    connectionListeners.delete(listener);
  };
}

/** React binding for the connection banner. */
export function useConnectionState(): ConnectionState {
  return useSyncExternalStore(subscribeConnection, getConnectionState, getConnectionState);
}

// Switching servers invalidates the previous status.
subscribeApiBase(() => {
  setConnection({ status: 'unknown', base: getApiBase(), checkedAt: null, lastError: null });
});

let authToken: string | null = null;

export function setAuthToken(token: string | null): void {
  authToken = token;
}

export class ApiClientError extends Error {
  status: number;
  code: string;
  details?: unknown;

  constructor(status: number, message: string, code = 'error', details?: unknown) {
    super(message);
    this.name = 'ApiClientError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

function targetLabel(base: string): string {
  if (!base) return 'the server';
  try {
    return new URL(base).host || base;
  } catch {
    return base;
  }
}

function networkErrorMessage(base: string, timedOut: boolean, offline: boolean): string {
  const where = base ? ` at ${targetLabel(base)}` : '';
  if (offline) {
    return `This device is offline. Reconnect to Wi-Fi to reach the HobyMine server${where}.`;
  }
  if (timedOut) {
    return `The HobyMine server${where} did not respond in time. Check your connection and try again.`;
  }
  return `Cannot reach the HobyMine server${where}. Check your internet connection and try again.`;
}

interface FetchOptions {
  timeoutMs?: number;
  /** Don't update the shared connection status (used when testing a candidate). */
  silent?: boolean;
}

async function fetchOnce(
  url: string,
  init: RequestInit,
  base: string,
  { timeoutMs = DEFAULT_TIMEOUT_MS, silent = false }: FetchOptions,
): Promise<Response> {
  const controller = new AbortController();
  let timedOut = false;
  const timeoutId = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);

  try {
    const response = await fetch(url, { ...init, signal: controller.signal });
    if (!silent) markOnline(base);
    return response;
  } catch (error) {
    // A caller-supplied abort is not ours to report; everything else is a
    // connectivity problem.
    if ((error as { name?: string } | null)?.name === 'AbortError' && !timedOut) {
      throw error;
    }
    const offline = typeof navigator !== 'undefined' && navigator.onLine === false;
    const message = networkErrorMessage(base, timedOut, offline);
    if (!silent) markOffline(base, message);
    throw new ApiClientError(0, message, 'network_error');
  } finally {
    clearTimeout(timeoutId);
  }
}

async function request<T>(
  path: string,
  init: RequestInit = {},
  options: FetchOptions = {},
): Promise<T> {
  const base = getApiBase();
  const method = (init.method ?? 'GET').toUpperCase();
  const maxAttempts = IDEMPOTENT_METHODS.has(method) ? RETRY_DELAYS_MS.length + 1 : 1;

  const headers = new Headers(init.headers);
  if (authToken) headers.set('Authorization', `Bearer ${authToken}`);

  const isFormData = init.body instanceof FormData;
  if (init.body && !isFormData && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  let lastError: unknown = null;

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    if (attempt > 0) {
      const backoff = RETRY_DELAYS_MS[attempt - 1] ?? 2000;
      await delay(backoff + Math.random() * 200);
      // The user may have switched servers while we were waiting.
      if (base !== getApiBase()) break;
    }

    let response: Response;
    try {
      response = await fetchOnce(
        `${base}${path}`,
        { ...init, headers },
        base,
        options,
      );
    } catch (error) {
      lastError = error;
      // Only connectivity failures (status 0) are worth retrying.
      const retryable =
        error instanceof ApiClientError && error.status === 0 && navigator.onLine !== false;
      if (!retryable || attempt === maxAttempts - 1) throw error;
      continue;
    }

    if (!response.ok) {
      let body: ApiErrorBody | null = null;
      try {
        body = (await response.json()) as ApiErrorBody;
      } catch {
        // Non-JSON error response
      }
      throw new ApiClientError(
        response.status,
        body?.error?.message ?? `Request failed (${response.status})`,
        body?.error?.code ?? 'error',
        body?.error?.details,
      );
    }

    if (response.status === 204) return undefined as T;
    return (await response.json()) as T;
  }

  throw (
    lastError ??
    new ApiClientError(0, networkErrorMessage(base, false, false), 'network_error')
  );
}

export const api = {
  get: <T>(path: string): Promise<T> => request<T>(path, { method: 'GET' }),
  post: <T>(path: string, body?: unknown): Promise<T> =>
    request<T>(path, {
      method: 'POST',
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
  patch: <T>(path: string, body?: unknown): Promise<T> =>
    request<T>(path, {
      method: 'PATCH',
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
  put: <T>(path: string, body?: unknown): Promise<T> =>
    request<T>(path, {
      method: 'PUT',
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
  delete: <T>(path: string, body?: unknown): Promise<T> =>
    request<T>(path, {
      method: 'DELETE',
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
  upload: <T>(path: string, formData: FormData): Promise<T> =>
    request<T>(path, { method: 'POST', body: formData }, { timeoutMs: UPLOAD_TIMEOUT_MS }),
};

export interface ApiProbeResult {
  ok: boolean;
  base: string;
  /** Round-trip time in ms when the server answered. */
  latencyMs: number;
  /** HTTP status when the server answered (even with a non-2xx code). */
  status?: number;
  error?: string;
}

/**
 * Checks whether an API base answers `/api/health`.
 *
 * Used by the connection banner (which retries automatically while offline)
 * and by the server settings screen to validate an address before saving it.
 * Pass a candidate base to test it without touching the app-wide status.
 */
export async function probeApi(
  candidate?: string,
  { updateState }: { updateState?: boolean } = {},
): Promise<ApiProbeResult> {
  const explicit = candidate !== undefined;
  const normalized = explicit ? normalizeApiBase(candidate) : getApiBase();

  if (normalized === null) {
    return {
      ok: false,
      base: candidate ?? '',
      latencyMs: 0,
      error: 'Enter a valid address such as http://192.168.1.33:4000',
    };
  }

  const shouldUpdate = updateState ?? (!explicit || normalized === getApiBase());
  const started = performance.now();

  try {
    const response = await fetchOnce(
      `${normalized}/api/health`,
      { method: 'GET', cache: 'no-store' },
      normalized,
      { timeoutMs: PROBE_TIMEOUT_MS, silent: !shouldUpdate },
    );

    const latencyMs = Math.round(performance.now() - started);
    if (!response.ok) {
      return {
        ok: false,
        base: normalized,
        latencyMs,
        status: response.status,
        error: `The server answered with HTTP ${response.status}.`,
      };
    }

    return { ok: true, base: normalized, latencyMs, status: response.status };
  } catch (error) {
    const latencyMs = Math.round(performance.now() - started);
    return {
      ok: false,
      base: normalized,
      latencyMs,
      error: error instanceof Error ? error.message : 'Could not reach the server.',
    };
  }
}
