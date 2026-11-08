import { Capacitor, registerPlugin, type PluginListenerHandle } from '@capacitor/core';
import { toast } from 'sonner';
import { getSocket, onSocketReady } from './socket';
import type { CaptureAttemptKind, CaptureContext } from '../types';

/**
 * Android screen-capture protection for chats and video calls.
 *
 * The native `HobymineSecurity` plugin marks the activity window with
 * FLAG_SECURE, which makes Android exclude it from screenshots, screen
 * recordings, casting and the recent-apps preview. Android 14+ and 15+ then
 * report capture attempts back to the app, and this module turns each attempt
 * into an immediate alert for the other participant.
 *
 * Both the chat and the call can hold the guard at the same time (a video call
 * launched from a chat). The video context wins when an attempt is reported so
 * the peer sees the in-call banner rather than a duplicate chat alert.
 */

interface SecurityStatus {
  platform: string;
  sdk: number;
  secure: boolean;
  screenshotDetection: boolean;
  screenRecordingDetection: boolean;
}

interface NativeCaptureEvent {
  kind?: string;
  at?: number;
}

interface SecurityPlugin {
  setSecure(options: { enabled: boolean }): Promise<SecurityStatus>;
  getStatus(): Promise<SecurityStatus>;
  addListener(
    eventName: 'captureAttempt',
    listener: (event: NativeCaptureEvent) => void,
  ): Promise<PluginListenerHandle> & PluginListenerHandle;
}

const NativeSecurity = registerPlugin<SecurityPlugin>('HobymineSecurity');

interface GuardEntry {
  /** Identifies this acquisition, so a re-render cannot release a newer one. */
  token: object;
  matchId: string;
  peerName?: string;
}

interface PendingAlert {
  matchId: string;
  kind: CaptureAttemptKind;
  context: CaptureContext;
}

const contexts = new Map<CaptureContext, GuardEntry>();
const lastLocalAlertAt = new Map<string, number>();
const pendingAlerts: PendingAlert[] = [];

/** How long the same attempt kind is collapsed into one alert. */
const LOCAL_ALERT_THROTTLE_MS = 3000;
/** Grace period before dropping FLAG_SECURE, so route transitions do not flicker. */
const SECURE_RELEASE_DELAY_MS = 180;

let nativeSecure = false;
let syncTimer: number | undefined;
let syncChain: Promise<void> = Promise.resolve();
let nativeListenerReady = false;
let outgoingBound = false;
let latestStatus: SecurityStatus | null = null;

/** True inside the Android Capacitor shell. Other platforms cannot block capture. */
export function isAndroidNative(): boolean {
  return Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android';
}

/** Last native capability report, or null when the shell has not answered yet. */
export function getCaptureProtectionStatus(): SecurityStatus | null {
  return latestStatus;
}

function firstName(name: string | undefined): string {
  return (name ?? '').trim().split(/\s+/)[0] ?? '';
}

function activeEntry(): { context: CaptureContext; entry: GuardEntry } | null {
  // A live video call takes priority over the chat underneath it.
  const context: CaptureContext = contexts.has('video') ? 'video' : 'chat';
  const entry = contexts.get(context);
  return entry ? { context, entry } : null;
}

function bindOutgoing(): void {
  if (outgoingBound) return;
  outgoingBound = true;
  // The socket is created by AppShell, which can mount after the call overlay.
  onSocketReady((socket) => {
    socket.off('connect', flushPendingAlerts);
    socket.on('connect', flushPendingAlerts);
    flushPendingAlerts();
  });
}

function flushPendingAlerts(): void {
  const socket = getSocket();
  if (!socket?.connected) return;
  while (pendingAlerts.length > 0) {
    const alert = pendingAlerts.shift();
    if (alert) socket.emit('security:capture-attempt', alert);
  }
}

function emitAttempt(entry: GuardEntry, kind: CaptureAttemptKind, context: CaptureContext): void {
  const alert: PendingAlert = { matchId: entry.matchId, kind, context };
  const socket = getSocket();
  if (socket?.connected) {
    socket.emit('security:capture-attempt', alert);
    return;
  }
  // Keep only the newest few attempts; an old screenshot is not worth a flood
  // when the connection comes back.
  pendingAlerts.push(alert);
  if (pendingAlerts.length > 5) pendingAlerts.shift();
}

function onNativeCapture(event: NativeCaptureEvent): void {
  const active = activeEntry();
  if (!active) return;

  const kind: CaptureAttemptKind =
    event?.kind === 'screen-recording' ? 'screen-recording' : 'screenshot';
  const throttleKey = `${active.context}:${active.entry.matchId}:${kind}`;
  const now = Date.now();
  if (now - (lastLocalAlertAt.get(throttleKey) ?? 0) < LOCAL_ALERT_THROTTLE_MS) return;
  lastLocalAlertAt.set(throttleKey, now);

  const peer = firstName(active.entry.peerName);
  toast.error(kind === 'screenshot' ? 'Screenshot blocked' : 'Screen recording blocked', {
    description: peer ? `${peer} was notified.` : 'The other person was notified.',
    icon: '🛡️',
    duration: 5200,
  });

  emitAttempt(active.entry, kind, active.context);
}

async function ensureNativeListener(): Promise<void> {
  if (nativeListenerReady || !isAndroidNative()) return;
  nativeListenerReady = true;
  bindOutgoing();
  try {
    await NativeSecurity.addListener('captureAttempt', onNativeCapture);
    latestStatus = await NativeSecurity.getStatus();
  } catch {
    // The plugin is missing in an older installed APK. Blocking is unavailable,
    // so allow the next acquisition to retry instead of silently giving up.
    nativeListenerReady = false;
  }
}

function applySecure(enabled: boolean): void {
  // Serialise calls so a quick acquire/release cannot land out of order.
  syncChain = syncChain.then(async () => {
    if (!isAndroidNative() || enabled === nativeSecure) return;
    try {
      latestStatus = await NativeSecurity.setSecure({ enabled });
      nativeSecure = enabled;
    } catch {
      // Keep the previous belief so the next acquisition retries.
    }
  });
}

function scheduleSecureSync(immediate: boolean): void {
  if (syncTimer !== undefined) window.clearTimeout(syncTimer);
  syncTimer = window.setTimeout(
    () => {
      syncTimer = undefined;
      applySecure(contexts.size > 0);
    },
    immediate ? 0 : SECURE_RELEASE_DELAY_MS,
  );
}

/**
 * Marks the screen as secure for a chat or a video call. Returns a release
 * function; call it when the screen unmounts or the call ends.
 */
export function acquireCaptureGuard(
  context: CaptureContext,
  options: { matchId: string; peerName?: string },
): () => void {
  if (!options.matchId) return () => undefined;

  const token = {};
  // Replacing the entry keeps the guard active (no FLAG_SECURE flicker) while
  // metadata such as the peer's name arrives after the first render.
  contexts.set(context, { token, matchId: options.matchId, peerName: options.peerName });

  void ensureNativeListener();
  scheduleSecureSync(true);

  return () => {
    const current = contexts.get(context);
    if (current?.token !== token) return;
    contexts.delete(context);
    scheduleSecureSync(false);
  };
}
