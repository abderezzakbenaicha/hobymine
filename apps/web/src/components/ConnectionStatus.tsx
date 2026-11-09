import { AnimatePresence, motion } from 'framer-motion';
import { CloudOff, Loader2, RefreshCw, Settings2 } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import {
  getConnectionState,
  probeApi,
  useConnectionState,
  type ApiProbeResult,
} from '../lib/api';
import { apiBaseLabel, useApiBase } from '../lib/apiConfig';
import { autoSwitchToKnownServer, type DiscoveredServer } from '../lib/serverDiscovery';
import { useAuthStore } from '../store/auth';
import { ServerSettingsModal } from './ServerSettingsModal';

/** How often the banner retries while the backend is unreachable. */
const RECONNECT_INTERVAL_MS = 6000;

interface ReconnectOutcome {
  result: ApiProbeResult;
  switched: DiscoveredServer | null;
}

/**
 * A slim global banner shown while the API cannot be reached, plus the retry
 * loop that recovers the session automatically once the server is back.
 *
 * Mounted at the app root so it also appears on the welcome screen (where the
 * user has no session yet) and over the onboarding flow.
 *
 * Recovery has two steps. First the configured address is probed again; if
 * that still fails, the addresses this device used successfully before are
 * probed and the app switches to one that answers. That is what keeps a phone
 * working when the development PC's LAN address changes (a very common case:
 * the router hands out a different IP after a reboot).
 */
export function ConnectionStatus() {
  const connection = useConnectionState();
  const base = useApiBase();
  const token = useAuthStore((state) => state.token);
  const user = useAuthStore((state) => state.user);
  const bootstrap = useAuthStore((state) => state.bootstrap);
  const refresh = useAuthStore((state) => state.refresh);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const previousStatus = useRef(connection.status);
  const recovering = useRef(false);

  /**
   * One recovery attempt: probe the current base, then fall back to any
   * previously working address. Never runs two attempts at once, so the
   * retry loop, a resume event and a button press cannot flood the network.
   */
  const attemptReconnect = useCallback(async (): Promise<ReconnectOutcome | null> => {
    if (recovering.current) return null;
    recovering.current = true;
    try {
      const result = await probeApi();
      if (result.ok || typeof navigator === 'undefined' || navigator.onLine === false) {
        return { result, switched: null };
      }

      const switched = await autoSwitchToKnownServer();
      if (!switched) return { result, switched: null };

      const after = await probeApi();
      if (after.ok) {
        toast.success('Switched server', {
          id: 'hobymine-server-switch',
          description: `Now using ${apiBaseLabel(switched.base)}`,
        });
        return { result: after, switched };
      }
      return { result, switched: null };
    } finally {
      recovering.current = false;
    }
  }, []);

  // Check once on launch so a cold start with the backend down explains itself
  // instead of only failing when the user tries to sign in. This also covers
  // the common "the APK was built for an older LAN address" case.
  useEffect(() => {
    void attemptReconnect();
  }, [attemptReconnect]);

  // Keep the browser's own connectivity signal in the loop: coming back to
  // Wi-Fi should retry immediately rather than waiting for the next tick.
  useEffect(() => {
    const onOnline = (): void => {
      void attemptReconnect();
    };
    window.addEventListener('online', onOnline);
    return () => window.removeEventListener('online', onOnline);
  }, [attemptReconnect]);

  // Coming back from the background, unlocking the phone or re-focusing the
  // window all mean the network may have changed underneath us. Probe right
  // away so the banner clears without waiting for the retry timer.
  useEffect(() => {
    const onResume = (): void => {
      if (document.visibilityState !== 'visible') return;
      if (getConnectionState().status === 'online') return;
      void attemptReconnect();
    };
    const onFocus = (): void => onResume();

    document.addEventListener('visibilitychange', onResume);
    window.addEventListener('focus', onFocus);
    window.addEventListener('pageshow', onFocus);
    return () => {
      document.removeEventListener('visibilitychange', onResume);
      window.removeEventListener('focus', onFocus);
      window.removeEventListener('pageshow', onFocus);
    };
  }, [attemptReconnect]);

  // Background reconnection loop while offline.
  useEffect(() => {
    if (connection.status !== 'offline') return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;

    const tick = async (): Promise<void> => {
      if (document.visibilityState === 'visible') await attemptReconnect();
      if (!cancelled) timer = setTimeout(() => void tick(), RECONNECT_INTERVAL_MS);
    };

    timer = setTimeout(() => void tick(), RECONNECT_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [connection.status, attemptReconnect]);

  // When the server comes back, restore the account that the outage kept
  // hidden (the token survived; only the user object is missing).
  useEffect(() => {
    const previous = previousStatus.current;
    previousStatus.current = connection.status;
    if (previous !== 'offline' || connection.status !== 'online') return;

    toast.success('Back online', {
      id: 'hobymine-connection',
      description: apiBaseLabel(),
    });
    useAuthStore.getState().clearError();
    if (!token) return;
    if (user) void refresh();
    else void bootstrap();
  }, [connection.status, token, user, bootstrap, refresh]);

  const retry = async (): Promise<void> => {
    setRetrying(true);
    try {
      const outcome = await attemptReconnect();
      if (!outcome) return;
      if (outcome.result.ok) {
        if (!outcome.switched) {
          toast.success('Connected', {
            description: `${apiBaseLabel()} · ${outcome.result.latencyMs} ms`,
          });
        }
      } else {
        toast.error('Still cannot reach the server', {
          description: outcome.result.error,
        });
      }
    } finally {
      setRetrying(false);
    }
  };

  const visible = connection.status === 'offline';

  return (
    <>
      <AnimatePresence>
        {visible && (
          <motion.div
            initial={{ opacity: 0, y: -18 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -18 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-x-0 top-0 z-[45] px-2 pt-[min(max(0.5rem,var(--safe-top,0px),env(safe-area-inset-top,0px)),3.5rem)]"
          >
            <div
              role="alert"
              className="mx-auto flex max-w-3xl items-center gap-2.5 rounded-2xl border border-rose/30 bg-ink-900/95 px-3 py-2.5 shadow-card backdrop-blur-xl"
            >
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-rose/15 text-rose">
                <CloudOff className="h-4 w-4" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[0.6875rem] font-bold text-white">
                  Can’t reach the server
                </p>
                <p className="truncate text-[0.625rem] text-ink-400">
                  {apiBaseLabel(base)} · retrying automatically
                </p>
              </div>
              <button
                type="button"
                onClick={() => void retry()}
                disabled={retrying}
                className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.06] px-2.5 text-[0.6875rem] font-semibold text-white transition hover:bg-white/10 disabled:opacity-60"
              >
                {retrying ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <RefreshCw className="h-3.5 w-3.5" />
                )}
                Retry
              </button>
              <button
                type="button"
                onClick={() => setSettingsOpen(true)}
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-white/10 bg-white/[0.06] text-ink-200 transition hover:bg-white/10 hover:text-white"
                aria-label="Server settings"
              >
                <Settings2 className="h-4 w-4" />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <ServerSettingsModal open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </>
  );
}
