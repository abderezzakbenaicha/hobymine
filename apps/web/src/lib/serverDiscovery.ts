import {
  defaultApiBase,
  getApiBase,
  getApiBaseHistory,
  normalizeApiBase,
  setApiBaseOverride,
} from './apiConfig';

/**
 * Finds the HobyMine backend when the configured address stops answering.
 *
 * Two very different operations live here:
 *
 * - **Known-server probing** is cheap and always safe: it tests the addresses
 *   this device has used before (most recent first) plus the built-in default.
 *   The app runs this automatically whenever the connection drops, which is
 *   how it recovers on its own after the PC's LAN address changes.
 * - **Subnet scanning** is expensive (up to 254 hosts), so it only runs when
 *   the user explicitly asks for it in Server settings.
 *
 * Every candidate must answer `GET /api/health` with `service: "hobymine-api"`.
 * That check matters: without it, a random web server on port 4000 would be
 * accepted as the backend and the app would show confusing errors.
 */

const HEALTH_PATH = '/api/health';
const SERVICE_ID = 'hobymine-api';

/** Port assumed when a candidate address does not carry one (dev default). */
const DEFAULT_PORT = '4000';

/** Per-candidate timeout for known-server probes (ms). */
const KNOWN_PROBE_TIMEOUT_MS = 4000;

/** Per-host timeout while scanning. Short, because unreachable hosts fail by timeout. */
const SCAN_HOST_TIMEOUT_MS = 1500;

/** How many hosts a subnet scan checks at once. */
const SCAN_CONCURRENCY = 24;

/** A /24 subnet is scanned at most, and only for a small number of subnets. */
const MAX_SCANNED_SUBNETS = 2;

export type ServerSource = 'current' | 'known' | 'default' | 'scan';

export interface DiscoveredServer {
  /** Normalised base URL, e.g. `http://192.168.1.33:4000`. */
  base: string;
  /** Round-trip time of the health check, in ms. */
  latencyMs: number;
  /** Why this address was tested. */
  source: ServerSource;
}

export interface ScanProgress {
  /** Hosts tested so far. */
  scanned: number;
  /** Hosts this scan will test in total. */
  total: number;
  /** Subnet currently being scanned, e.g. `192.168.1.x`. */
  subnet: string;
  /** Servers found so far, fastest first. */
  found: DiscoveredServer[];
}

interface HealthResult {
  ok: boolean;
  latencyMs: number;
  error?: string;
}

/** Asks a single base for its health payload and verifies it is HobyMine. */
async function checkHealth(
  base: string,
  timeoutMs: number,
  signal?: AbortSignal,
): Promise<HealthResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const onOuterAbort = (): void => controller.abort();
  signal?.addEventListener('abort', onOuterAbort);
  const started = performance.now();

  try {
    const response = await fetch(`${base}${HEALTH_PATH}`, {
      method: 'GET',
      cache: 'no-store',
      headers: { Accept: 'application/json' },
      signal: controller.signal,
    });
    const latencyMs = Math.round(performance.now() - started);
    if (!response.ok) {
      return { ok: false, latencyMs, error: `HTTP ${response.status}` };
    }

    // A wrong service answering on the port must never be accepted.
    const body = (await response.json().catch(() => null)) as {
      ok?: boolean;
      service?: string;
    } | null;
    if (!body || body.service !== SERVICE_ID) {
      return { ok: false, latencyMs, error: 'Not a HobyMine server' };
    }
    return { ok: true, latencyMs };
  } catch (error) {
    const latencyMs = Math.round(performance.now() - started);
    return {
      ok: false,
      latencyMs,
      error: error instanceof Error ? error.message : 'Unreachable',
    };
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', onOuterAbort);
  }
}

/** Every address worth testing without scanning, de-duplicated. */
export function candidateBases(): Array<{ base: string; source: ServerSource }> {
  const seen = new Set<string>();
  const result: Array<{ base: string; source: ServerSource }> = [];

  const push = (raw: string, source: ServerSource): void => {
    const normalized = normalizeApiBase(raw);
    if (!normalized || seen.has(normalized)) return;
    seen.add(normalized);
    result.push({ base: normalized, source });
  };

  push(getApiBase(), 'current');
  for (const base of getApiBaseHistory()) push(base, 'known');
  push(defaultApiBase, 'default');

  return result;
}

function byLatency(a: DiscoveredServer, b: DiscoveredServer): number {
  return a.latencyMs - b.latencyMs;
}

/**
 * Tests the current address, the remembered ones and the built-in default
 * concurrently. Returns reachable servers, fastest first.
 */
export async function probeKnownServers(options: {
  signal?: AbortSignal;
  timeoutMs?: number;
} = {}): Promise<DiscoveredServer[]> {
  const timeoutMs = options.timeoutMs ?? KNOWN_PROBE_TIMEOUT_MS;
  const probes = candidateBases().map(async ({ base, source }) => {
    const health = await checkHealth(base, timeoutMs, options.signal);
    if (!health.ok) return null;
    return { base, latencyMs: health.latencyMs, source } satisfies DiscoveredServer;
  });

  const results = await Promise.all(probes);
  return results.filter((entry): entry is DiscoveredServer => entry !== null).sort(byLatency);
}

/**
 * Tested addresses that can replace the current one. The current base is only
 * included when it is the only thing that answers (the caller then just
 * re-probes it).
 */
export async function findAlternativeServer(options: {
  signal?: AbortSignal;
  timeoutMs?: number;
} = {}): Promise<DiscoveredServer | null> {
  const current = getApiBase();
  const reachable = await probeKnownServers(options);
  // Never move away from an address that answers: a single failed probe can be
  // a transient hiccup, and flapping between two live servers would be worse
  // than staying put.
  if (reachable.some((entry) => entry.base === current)) return null;
  return reachable[0] ?? null;
}

/**
 * Switches to a remembered address that answers, if the current one does not.
 *
 * Returns the server it switched to, or `null` when nothing moved. Safe to
 * call repeatedly: it never scans, and it leaves the current address alone
 * while that address is reachable.
 */
export async function autoSwitchToKnownServer(options: {
  signal?: AbortSignal;
  timeoutMs?: number;
} = {}): Promise<DiscoveredServer | null> {
  const alternative = await findAlternativeServer(options);
  if (!alternative) return null;

  const switched = setApiBaseOverride(alternative.base);
  if (!switched) return null;
  return alternative;
}

/** Turns a base URL into the `/24` prefix and port used for scanning. */
export function subnetOf(base: string): { prefix: string; port: string } | null {
  const normalized = normalizeApiBase(base);
  if (!normalized) return null;

  let url: URL;
  try {
    url = new URL(normalized);
  } catch {
    return null;
  }

  const ipv4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(url.hostname);
  if (!ipv4) return null;

  const octets = ipv4.slice(1, 5).map((part) => Number.parseInt(part, 10));
  if (octets.some((octet) => Number.isNaN(octet) || octet < 0 || octet > 255)) return null;
  // Loopback/link-local ranges cannot host the phone's LAN backend.
  if (octets[0] === 127 || octets[0] === 0) return null;

  return {
    prefix: `${octets[0]}.${octets[1]}.${octets[2]}`,
    port: url.port || (url.protocol === 'https:' ? '443' : DEFAULT_PORT),
  };
}

/**
 * Subnets worth scanning, derived from the addresses this device knows about.
 *
 * The app cannot read the phone's own IP from a WebView, so the best signal is
 * the address of the backend the user configured: if the PC moved within the
 * same /24, scanning that /24 finds it.
 */
export function scannableSubnets(bases: string[] = []): Array<{ prefix: string; port: string }> {
  const sources = [
    ...bases,
    getApiBase(),
    ...getApiBaseHistory(),
    defaultApiBase,
  ];

  const seen = new Set<string>();
  const result: Array<{ prefix: string; port: string }> = [];
  for (const base of sources) {
    const subnet = subnetOf(base);
    if (!subnet) continue;
    const key = `${subnet.prefix}:${subnet.port}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(subnet);
    if (result.length >= MAX_SCANNED_SUBNETS) break;
  }
  return result;
}

function uniqueSorted(servers: DiscoveredServer[]): DiscoveredServer[] {
  const byBase = new Map<string, DiscoveredServer>();
  for (const server of servers) {
    const existing = byBase.get(server.base);
    if (!existing || server.latencyMs < existing.latencyMs) byBase.set(server.base, server);
  }
  return [...byBase.values()].sort(byLatency);
}

/**
 * Scans the known /24 subnet(s) for a HobyMine server on the same port.
 *
 * Expensive by design (up to 254 hosts per subnet), so this is only called
 * from the explicit "Auto-detect on Wi-Fi" action. `signal` cancels the scan
 * when the settings modal closes.
 */
export async function scanForServers(options: {
  onProgress?: (progress: ScanProgress) => void;
  signal?: AbortSignal;
  bases?: string[];
} = {}): Promise<DiscoveredServer[]> {
  const subnets = scannableSubnets(options.bases);
  if (subnets.length === 0) return [];

  const hosts: Array<{ base: string; subnet: string }> = [];
  for (const subnet of subnets) {
    for (let host = 1; host <= 254; host += 1) {
      hosts.push({
        base: `http://${subnet.prefix}.${host}:${subnet.port}`,
        subnet: `${subnet.prefix}.x`,
      });
    }
  }

  const found: DiscoveredServer[] = [];
  let next = 0;
  let scanned = 0;

  const report = (subnet: string): void => {
    options.onProgress?.({
      scanned,
      total: hosts.length,
      subnet,
      found: uniqueSorted(found),
    });
  };

  const worker = async (): Promise<void> => {
    while (next < hosts.length) {
      if (options.signal?.aborted) return;
      const index = next;
      next += 1;
      const host = hosts[index];
      const health = await checkHealth(host.base, SCAN_HOST_TIMEOUT_MS, options.signal);
      if (options.signal?.aborted) return;
      scanned += 1;
      if (health.ok) {
        found.push({ base: host.base, latencyMs: health.latencyMs, source: 'scan' });
      }
      report(host.subnet);
    }
  };

  await Promise.all(Array.from({ length: SCAN_CONCURRENCY }, worker));
  report(subnets[0] ? `${subnets[0].prefix}.x` : '');

  return uniqueSorted(found);
}
