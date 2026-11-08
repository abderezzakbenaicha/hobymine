import { Capacitor } from '@capacitor/core';

type BackHandler = () => boolean;

const backHandlers = new Set<BackHandler>();
/** Closers for open overlays (modals, sheets, drawers) in last-opened-first order. */
const overlayClosers: (() => void)[] = [];

interface NativeBridgeWindow {
  __hobymineBack?: () => boolean;
}

/** True when the app runs inside the Capacitor shell. */
export function isNativePlatform(): boolean {
  return Capacitor.isNativePlatform();
}

/**
 * Register a handler for the Android hardware back button. Handlers run in
 * registration order and the first one that returns `true` consumes the
 * press. Returning `false` lets the native shell close the app.
 */
export function registerBackHandler(handler: BackHandler): () => void {
  backHandlers.add(handler);
  return () => {
    backHandlers.delete(handler);
  };
}

/**
 * Register an overlay (modal, bottom sheet, drawer) so the hardware back
 * button closes it instead of navigating.
 */
export function registerOverlay(close: () => void): () => void {
  overlayClosers.push(close);
  return () => {
    const index = overlayClosers.indexOf(close);
    if (index >= 0) overlayClosers.splice(index, 1);
  };
}

/** Closes the top-most overlay. Returns true when something was closed. */
export function closeTopOverlay(): boolean {
  const closer = overlayClosers[overlayClosers.length - 1];
  if (!closer) return false;
  closer();
  return true;
}

/**
 * Called by the native shell (MainActivity) before it closes the app. The
 * web app decides what the back button means: close an overlay, move back
 * inside the app, or let the app go to the background.
 */
export function handleNativeBack(): boolean {
  if (closeTopOverlay()) return true;
  for (const handler of backHandlers) {
    if (handler()) return true;
  }
  return false;
}

/** Exposes the back handler to the native shell. Safe to call more than once. */
export function installNativeBackBridge(): void {
  if (typeof window === 'undefined') return;
  const bridge = window as unknown as NativeBridgeWindow;
  bridge.__hobymineBack = handleNativeBack;
}
