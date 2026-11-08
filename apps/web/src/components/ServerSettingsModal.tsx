import {
  Check,
  CircleAlert,
  Loader2,
  Radar,
  RotateCcw,
  Save,
  Server,
  Wifi,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { probeApi, useConnectionState, type ApiProbeResult } from '../lib/api';
import {
  apiBaseLabel,
  defaultApiBase,
  getApiBase,
  getApiBaseOverride,
  normalizeApiBase,
  setApiBaseOverride,
} from '../lib/apiConfig';
import {
  probeKnownServers,
  scanForServers,
  type DiscoveredServer,
  type ScanProgress,
} from '../lib/serverDiscovery';
import { useAuthStore } from '../store/auth';
import { cn } from '../lib/utils';
import { Modal } from './Modal';

interface ServerSettingsModalProps {
  open: boolean;
  onClose: () => void;
}

function displayDefault(): string {
  if (defaultApiBase) return defaultApiBase;
  return typeof window !== 'undefined' ? window.location.origin : 'this site';
}

function sourceLabel(source: DiscoveredServer['source']): string {
  switch (source) {
    case 'known':
      return 'Used before';
    case 'default':
      return 'Built-in';
    case 'current':
      return 'Current';
    default:
      return 'Found on Wi-Fi';
  }
}

/**
 * Lets the user point the app at a different backend without rebuilding.
 *
 * This is what keeps an installed APK usable when the development PC's LAN
 * address changes: the app can search for the server automatically ("Auto-detect
 * on Wi-Fi"), or the user can type the new `http://<ip>:4000`, test it and save.
 * Either way the choice is stored in localStorage and used immediately by both
 * the REST client and the Socket.io connection.
 */
export function ServerSettingsModal({ open, onClose }: ServerSettingsModalProps) {
  const connection = useConnectionState();
  const [value, setValue] = useState('');
  const [testing, setTesting] = useState(false);
  const [result, setResult] = useState<ApiProbeResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [detecting, setDetecting] = useState(false);
  const [phase, setPhase] = useState<'known' | 'scan' | null>(null);
  const [progress, setProgress] = useState<ScanProgress | null>(null);
  const [found, setFound] = useState<DiscoveredServer[]>([]);
  const abortRef = useRef<AbortController | null>(null);

  // Reset transient state whenever the sheet opens, and cancel a running scan
  // when it closes so a dismissed dialog never keeps probing the network.
  useEffect(() => {
    if (!open) {
      abortRef.current?.abort();
      abortRef.current = null;
      setDetecting(false);
      setPhase(null);
      setProgress(null);
      return;
    }
    setValue(getApiBase() || displayDefault());
    setResult(null);
    setError(null);
    setFound([]);
    setProgress(null);
    setPhase(null);
  }, [open]);

  const applyBase = async (normalized: string | null): Promise<void> => {
    setApiBaseOverride(normalized || null);
    onClose();
    toast.success(
      normalized ? 'Server address saved' : 'Using the built-in server address',
      { description: normalized ? apiBaseLabel(normalized) : undefined },
    );

    const probe = await probeApi();
    if (!probe.ok) {
      toast.error('Saved, but the server is not responding', {
        description: probe.error,
      });
      return;
    }
    // Drop a stale "cannot reach the server" message from the sign-in screen.
    useAuthStore.getState().clearError();
    // Re-validate the session against the new server. This either restores the
    // account (after an outage) or signs the user out if the token is unknown
    // to that server.
    if (useAuthStore.getState().token) void useAuthStore.getState().bootstrap();
  };

  const test = async (): Promise<void> => {
    const normalized = normalizeApiBase(value);
    if (normalized === null) {
      setError('Enter a valid address, for example http://192.168.1.33:4000');
      setResult(null);
      return;
    }
    setError(null);
    setTesting(true);
    try {
      // Empty means "the built-in address", which is the same origin in a
      // browser build and the baked-in LAN URL in the Android app.
      setResult(await probeApi(normalized || displayDefault()));
    } finally {
      setTesting(false);
    }
  };

  const save = async (): Promise<void> => {
    const normalized = normalizeApiBase(value);
    if (normalized === null) {
      setError('Enter a valid address, for example http://192.168.1.33:4000');
      return;
    }
    await applyBase(normalized);
  };

  /**
   * Cheap pass first (addresses this device has used), then a full /24 scan
   * only if nothing answered. The scan tests every host in the subnet, so it
   * is always user-initiated and shows progress.
   */
  const detect = async (): Promise<void> => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setDetecting(true);
    setError(null);
    setResult(null);
    setFound([]);
    setProgress(null);
    setPhase('known');

    try {
      const known = await probeKnownServers({ signal: controller.signal });
      if (controller.signal.aborted) return;
      if (known.length > 0) {
        setFound(known);
        return;
      }

      setPhase('scan');
      const scanned = await scanForServers({
        signal: controller.signal,
        onProgress: (update) => setProgress(update),
      });
      if (controller.signal.aborted) return;
      setFound(scanned);
      if (scanned.length === 0) {
        setError(
          'No HobyMine server answered on this Wi-Fi. Check that the backend is running and that the phone is on the same network as the computer.',
        );
      }
    } finally {
      if (!controller.signal.aborted || abortRef.current === controller) {
        setDetecting(false);
        setPhase(null);
        setProgress(null);
      }
    }
  };

  const reset = async (): Promise<void> => {
    setApiBaseOverride(null);
    setValue(displayDefault());
    setResult(null);
    setError(null);
    toast.success('Restored the built-in server address', {
      description: displayDefault(),
    });
    useAuthStore.getState().clearError();
    if (useAuthStore.getState().token) void useAuthStore.getState().bootstrap();
    void probeApi();
  };

  const hasOverride = getApiBaseOverride() !== null;
  const connected = connection.status === 'online';
  const current = getApiBase();
  const percent =
    progress && progress.total > 0
      ? Math.min(100, Math.round((progress.scanned / progress.total) * 100))
      : 0;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Server settings"
      description="Choose which HobyMine backend this device talks to."
    >
      <div className="space-y-4 pb-5">
        <div className="flex items-start gap-3 rounded-2xl border border-white/[0.06] bg-white/[0.02] px-3.5 py-3">
          <span
            className={cn(
              'mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full',
              connected
                ? 'bg-neon/15 text-neon'
                : connection.status === 'offline'
                  ? 'bg-rose/15 text-rose'
                  : 'bg-white/[0.06] text-ink-400',
            )}
          >
            <Wifi className="h-4 w-4" />
          </span>
          <div className="min-w-0">
            <p className="text-xs font-semibold text-white">
              {connected
                ? 'Connected'
                : connection.status === 'offline'
                  ? 'Not reachable'
                  : 'Not checked yet'}
            </p>
            <p className="mt-0.5 truncate text-[0.6875rem] text-ink-400">
              {apiBaseLabel()}
            </p>
            {connection.lastError && connection.status === 'offline' && (
              <p className="mt-1 text-[0.625rem] leading-relaxed text-ink-500">
                {connection.lastError}
              </p>
            )}
          </div>
        </div>

        <div>
          <label htmlFor="api-base" className="label">
            Server address
          </label>
          <div className="relative">
            <Server className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-500" />
            <input
              id="api-base"
              className="field pl-10"
              value={value}
              onChange={(event) => {
                setValue(event.target.value);
                setError(null);
                setResult(null);
              }}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault();
                  void test();
                }
              }}
              placeholder="http://192.168.1.33:4000"
              inputMode="url"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              disabled={testing || detecting}
            />
          </div>
          <p className="mt-2 text-[0.625rem] leading-relaxed text-ink-500">
            On the same Wi-Fi as the development computer, use its LAN IPv4 address and port
            4000. You can find it with <span className="text-ink-300">ipconfig</span> (IPv4
            Address). For a hosted backend, use its HTTPS URL.
          </p>
        </div>

        {error && (
          <p
            role="alert"
            className="flex items-start gap-2 rounded-xl border border-rose/25 bg-rose/[0.07] px-3 py-2.5 text-[0.6875rem] leading-relaxed text-rose"
          >
            <CircleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            {error}
          </p>
        )}

        {result && !error && (
          <p
            role="status"
            className={cn(
              'flex items-start gap-2 rounded-xl border px-3 py-2.5 text-[0.6875rem] leading-relaxed',
              result.ok
                ? 'border-neon/25 bg-neon/[0.06] text-neon-soft'
                : 'border-rose/25 bg-rose/[0.07] text-rose',
            )}
          >
            {result.ok ? (
              <Check className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            ) : (
              <CircleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            )}
            <span className="min-w-0">
              {result.ok
                ? `Server responded in ${result.latencyMs} ms.`
                : result.error ?? 'The server did not answer.'}
            </span>
          </p>
        )}

        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            className="btn-ghost"
            onClick={() => void test()}
            disabled={testing || detecting}
          >
            {testing ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Wifi className="h-4 w-4" />
            )}
            {testing ? 'Testing…' : 'Test'}
          </button>
          <button
            type="button"
            className="btn-primary"
            onClick={() => void save()}
            disabled={detecting}
          >
            <Save className="h-4 w-4" />
            Save
          </button>
        </div>

        <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] px-3.5 py-3">
          <div className="flex items-center gap-2">
            <Radar
              className={cn('h-4 w-4 shrink-0 text-neon', detecting && 'animate-spin')}
            />
            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold text-white">Find the server automatically</p>
              <p className="mt-0.5 text-[0.625rem] leading-relaxed text-ink-500">
                Checks the addresses this device used before, then scans this Wi-Fi network
                if needed.
              </p>
            </div>
          </div>

          <button
            type="button"
            className="btn-ghost mt-2.5 w-full"
            onClick={() => void detect()}
            disabled={detecting || testing}
          >
            {detecting ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Radar className="h-4 w-4" />
            )}
            {detecting
              ? phase === 'scan'
                ? 'Scanning this Wi-Fi…'
                : 'Checking known addresses…'
              : 'Auto-detect on Wi-Fi'}
          </button>

          {detecting && phase === 'scan' && progress && (
            <div className="mt-3">
              <div className="h-1.5 overflow-hidden rounded-full bg-white/[0.07]">
                <div
                  className="h-full rounded-full bg-neon transition-[width] duration-200"
                  style={{ width: `${percent}%` }}
                />
              </div>
              <p className="mt-1.5 text-[0.625rem] tabular-nums text-ink-500">
                {progress.subnet} · {progress.scanned}/{progress.total} addresses ·{' '}
                {progress.found.length} found
              </p>
            </div>
          )}

          {found.length > 0 && (
            <ul className="mt-3 space-y-1.5">
              {found.map((server) => {
                const isCurrent = server.base === current;
                return (
                  <li key={server.base}>
                    <button
                      type="button"
                      onClick={() => void applyBase(server.base)}
                      className={cn(
                        'flex w-full items-center gap-2 rounded-xl border px-2.5 py-2 text-left transition',
                        isCurrent
                          ? 'border-neon/30 bg-neon/[0.06]'
                          : 'border-white/[0.07] bg-white/[0.03] hover:border-neon/30 hover:bg-neon/[0.06]',
                      )}
                    >
                      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-neon/15 text-neon">
                        {isCurrent ? (
                          <Check className="h-3.5 w-3.5" />
                        ) : (
                          <Server className="h-3.5 w-3.5" />
                        )}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[0.6875rem] font-semibold text-white">
                          {apiBaseLabel(server.base)}
                        </span>
                        <span className="block text-[0.625rem] text-ink-500">
                          {sourceLabel(server.source)} · {server.latencyMs} ms
                        </span>
                      </span>
                      <span className="shrink-0 text-[0.625rem] font-semibold text-neon">
                        {isCurrent ? 'In use' : 'Use'}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}

          {found.length > 0 && !detecting && (
            <p className="mt-2 text-[0.625rem] leading-relaxed text-ink-500">
              Tap an address to use it right away.
            </p>
          )}
        </div>

        <button
          type="button"
          className="btn-subtle w-full"
          onClick={() => void reset()}
          disabled={!hasOverride}
        >
          <RotateCcw className="h-3.5 w-3.5" />
          Use the built-in address
        </button>

        <div className="rounded-xl border border-white/[0.05] bg-white/[0.02] px-3 py-2.5">
          <p className="text-[0.625rem] uppercase tracking-[0.14em] text-ink-500">
            Built-in default
          </p>
          <p className="mt-1 break-all text-[0.6875rem] text-ink-300">{displayDefault()}</p>
        </div>
      </div>
    </Modal>
  );
}
