import { create } from 'zustand';
import { syncSystemBarStyle } from '../lib/safe-area';

export type ThemeMode = 'dark' | 'light' | 'system';
export type ResolvedTheme = 'dark' | 'light';

const STORAGE_KEY = 'hobymine.theme';
const DEFAULT_THEME: ResolvedTheme = 'light';
const DARK_QUERY = '(prefers-color-scheme: dark)';

/** Matches the `--canvas` value of each theme, so the Android status bar follows. */
const THEME_COLORS: Record<ResolvedTheme, string> = {
  dark: '#06070A',
  light: '#F4F5F8',
};

function isThemeMode(value: unknown): value is ThemeMode {
  return value === 'light' || value === 'dark' || value === 'system';
}

/**
 * Some Android WebViews and older Safari builds lack `matchMedia`, throw from
 * it, or return `null` / a stub without `matches`. A missing media query must
 * never take the app down, so every path here degrades to "not dark".
 */
function getMediaQuery(query: string): MediaQueryList | null {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return null;
  try {
    const media = window.matchMedia(query);
    return media && typeof media === 'object' ? media : null;
  } catch {
    return null;
  }
}

function prefersDark(): boolean {
  const media = getMediaQuery(DARK_QUERY);
  return media !== null && media.matches === true;
}

function readStoredMode(): ThemeMode {
  if (typeof window === 'undefined') return DEFAULT_THEME;
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (isThemeMode(stored)) return stored;
  } catch {
    // Private browsing can refuse storage; the default theme still applies.
  }
  return DEFAULT_THEME;
}

/**
 * Resolves any stored value to a real theme. A corrupt or missing mode can
 * never produce `undefined`, because `data-theme="undefined"` would drop the
 * whole `--ink-*` ramp and render the app as a blank screen.
 */
export function resolveTheme(mode: unknown): ResolvedTheme {
  if (mode === 'dark') return 'dark';
  if (mode === 'system') return prefersDark() ? 'dark' : DEFAULT_THEME;
  return DEFAULT_THEME;
}

function colorFor(theme: ResolvedTheme): string {
  return THEME_COLORS[theme] ?? THEME_COLORS[DEFAULT_THEME];
}

/** Writes the theme onto the document, where the CSS variables pick it up. */
function writeToDocument(theme: ResolvedTheme): void {
  if (typeof document === 'undefined') return;

  try {
    const root = document.documentElement;
    if (root) root.dataset.theme = theme;
  } catch {
    // A locked-down WebView can reject DOM writes; the CSS palette remains.
  }

  try {
    const head = document.head;
    if (!head) return;
    let meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
    if (!meta) {
      meta = document.createElement('meta');
      meta.setAttribute('name', 'theme-color');
      head.appendChild(meta);
    }
    meta.setAttribute('content', colorFor(theme));
  } catch {
    // The theme-color hint is cosmetic; the theme itself is already applied.
  }
}

/**
 * Applies a theme and returns the value that was written. This is the single
 * entry point for every theme change and it cannot throw: any failure (DOM,
 * native bridge) falls back to the default palette instead of escaping into a
 * React event handler or a DOM listener.
 */
export function applyTheme(mode: unknown): ResolvedTheme {
  let theme: ResolvedTheme = DEFAULT_THEME;
  try {
    theme = resolveTheme(mode);
    writeToDocument(theme);
  } catch {
    theme = DEFAULT_THEME;
    try {
      writeToDocument(theme);
    } catch {
      // Nothing left to fall back to; the CSS default palette is already live.
    }
  }

  try {
    void syncSystemBarStyle(theme === 'dark');
  } catch {
    // An older native shell without the plugin keeps its default bars.
  }

  return theme;
}

interface ThemeState {
  mode: ThemeMode;
  resolved: ResolvedTheme;
  setMode: (mode: ThemeMode) => void;
}

const initialMode = readStoredMode();

export const useThemeStore = create<ThemeState>((set) => ({
  mode: initialMode,
  resolved: resolveTheme(initialMode),

  setMode: (mode) => {
    if (!isThemeMode(mode)) return;

    // Update the UI even if storage or the native bridge refuses the change.
    const resolved = applyTheme(mode);
    set({ mode, resolved });

    try {
      window.localStorage.setItem(STORAGE_KEY, mode);
    } catch {
      // A refused write only costs persistence, not the switch itself.
    }
  },
}));

let stopThemeSync: (() => void) | null = null;

/**
 * Applies the stored theme before the first paint and keeps "system" in step
 * with the device. `index.html` runs the same logic inline so a reload never
 * flashes the wrong theme.
 *
 * Idempotent: calling it again (for example during HMR) reuses the existing
 * listener instead of stacking duplicate scheme-change handlers.
 *
 * Safe on every platform: it never throws, so a WebView that refuses
 * `matchMedia` cannot stop the app from mounting.
 */
export function startThemeSync(): () => void {
  if (stopThemeSync) return stopThemeSync;

  // Adopt the saved theme first; a failure here must not stop the listener.
  try {
    const resolved = applyTheme(useThemeStore.getState().mode);
    if (useThemeStore.getState().resolved !== resolved) {
      useThemeStore.setState({ resolved });
    }
  } catch {
    useThemeStore.setState({ resolved: DEFAULT_THEME });
  }

  const media = getMediaQuery(DARK_QUERY);
  if (!media) {
    stopThemeSync = () => {
      stopThemeSync = null;
    };
    return stopThemeSync;
  }

  let frame: number | null = null;
  let usingTimeout = false;
  let applying = false;

  /** Reads the device scheme once and commits it, outside of the DOM callback. */
  const flush = (): void => {
    frame = null;
    if (applying) return;
    applying = true;
    try {
      if (useThemeStore.getState().mode !== 'system') return;
      const next = applyTheme('system');
      if (useThemeStore.getState().resolved !== next) {
        useThemeStore.setState({ resolved: next });
      }
    } catch {
      // A failed scheme read must never crash the running app.
      useThemeStore.setState({ resolved: DEFAULT_THEME });
    } finally {
      applying = false;
    }
  };

  /**
   * Android fires several `change` events while the system animates between
   * light and dark, so the work is coalesced into a single update per frame.
   * The state commit happens outside the callback, never during a DOM event.
   */
  const onChange = (): void => {
    try {
      if (useThemeStore.getState().mode !== 'system') return;
      if (frame !== null) return;
      if (typeof window !== 'undefined' && typeof window.requestAnimationFrame === 'function') {
        usingTimeout = false;
        frame = window.requestAnimationFrame(flush);
      } else {
        usingTimeout = true;
        frame = window.setTimeout(flush, 16);
      }
    } catch {
      flush();
    }
  };

  try {
    if (typeof media.addEventListener === 'function') media.addEventListener('change', onChange);
    else if (typeof media.addListener === 'function') media.addListener(onChange);
  } catch {
    // No listener support: the theme is still applied on mode changes.
  }

  const stop = (): void => {
    if (frame !== null) {
      try {
        if (usingTimeout) window.clearTimeout(frame);
        else if (typeof window.cancelAnimationFrame === 'function') {
          window.cancelAnimationFrame(frame);
        }
      } catch {
        // The pending frame is already gone.
      }
      frame = null;
    }

    try {
      if (typeof media.removeEventListener === 'function') {
        media.removeEventListener('change', onChange);
      } else if (typeof media.removeListener === 'function') {
        media.removeListener(onChange);
      }
    } catch {
      // The WebView is already tearing down the media query.
    }
    stopThemeSync = null;
  };

  stopThemeSync = stop;
  return stop;
}
