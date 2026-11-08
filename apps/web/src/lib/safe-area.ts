import { Capacitor, registerPlugin } from '@capacitor/core';

export interface SafeAreaInsets {
  top: number;
  bottom: number;
  left: number;
  right: number;
}

interface DevicePlugin {
  getInsets(): Promise<SafeAreaInsets>;
  setSystemBarStyle(options: { dark: boolean }): Promise<void>;
}

/**
 * Native helper that reports the Android window insets (see
 * android/.../HobymineDevice.java). On Android 15+ apps are drawn edge to
 * edge, so the web layer needs to know how tall the status bar is to keep the
 * top bar and the bottom navigation clear of the system bars.
 */
const Device = registerPlugin<DevicePlugin>('HobymineDevice');

const EMPTY: SafeAreaInsets = { top: 0, bottom: 0, left: 0, right: 0 };

let insets: SafeAreaInsets = EMPTY;
const listeners = new Set<(value: SafeAreaInsets) => void>();

function applyToDocument(value: SafeAreaInsets): void {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  root.style.setProperty('--safe-top', `${value.top}px`);
  root.style.setProperty('--safe-bottom', `${value.bottom}px`);
  root.style.setProperty('--safe-left', `${value.left}px`);
  root.style.setProperty('--safe-right', `${value.right}px`);
}

export function setSafeAreaInsets(next: Partial<SafeAreaInsets>): void {
  insets = { ...insets, ...next };
  applyToDocument(insets);
  for (const listener of listeners) listener(insets);
}

export function getSafeAreaInsets(): SafeAreaInsets {
  return insets;
}

export function subscribeSafeArea(listener: (value: SafeAreaInsets) => void): () => void {
  listeners.add(listener);
  listener(insets);
  return () => {
    listeners.delete(listener);
  };
}

/**
 * Matches the status-bar and navigation-bar icons to the app theme. The app
 * can be light while the device is in dark mode (and the other way round), so
 * the system cannot work this out on its own.
 */
export async function syncSystemBarStyle(dark: boolean): Promise<void> {
  try {
    if (!Capacitor.isNativePlatform()) return;
    await Device.setSystemBarStyle({ dark });
  } catch {
    // An older shell without the method still works, just with default icons.
  }
}

/**
 * Reads the native insets and keeps the CSS variables in sync. Safe to call
 * more than once — orientation changes and window resizes call it again.
 */
export async function refreshSafeArea(): Promise<void> {
  if (!Capacitor.isNativePlatform()) {
    // On the web the `env(safe-area-inset-*)` values are used instead.
    applyToDocument(EMPTY);
    return;
  }
  try {
    const next = await Device.getInsets();
    setSafeAreaInsets(next);
  } catch {
    applyToDocument(EMPTY);
  }
}
