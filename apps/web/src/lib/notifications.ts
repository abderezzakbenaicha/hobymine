import { Capacitor, registerPlugin } from '@capacitor/core';

export interface NotificationPayload {
  id?: number;
  title: string;
  body: string;
  /** 'messages' for chat, 'activity' for likes and matches. */
  channel?: 'messages' | 'activity';
  /** Opens the conversation when the notification is tapped. */
  matchId?: string;
}

export interface LaunchPayload {
  matchId?: string;
  title?: string;
}

interface NotificationsPlugin {
  requestPermission(): Promise<{ granted: boolean }>;
  show(options: {
    id?: number;
    title: string;
    body: string;
    channelId?: string;
    matchId?: string;
  }): Promise<void>;
  getLaunchPayload(): Promise<LaunchPayload>;
  clearLaunchPayload(): Promise<void>;
  saveSession(options: { token: string; apiBase: string }): Promise<void>;
  clearSession(): Promise<void>;
  setAppVisible(options: { visible: boolean }): Promise<void>;
  startBackgroundService(): Promise<void>;
  stopBackgroundService(): Promise<void>;
}

const NativeNotifications = registerPlugin<NotificationsPlugin>('HobymineNotifications');

const CHANNEL_IDS = {
  messages: 'hobymine_messages',
  activity: 'hobymine_activity',
};

/** Key used to remember whether background alerts are switched on. */
const BACKGROUND_KEY = 'hobymine.backgroundAlerts';

/** True when the app is in the foreground and the user is looking at it. */
export function isAppVisible(): boolean {
  if (typeof document === 'undefined') return true;
  return document.visibilityState === 'visible';
}

/**
 * Asks for the notification permission. On Android this is the
 * POST_NOTIFICATIONS runtime permission, in the browser it is the standard
 * Notification API prompt.
 */
export async function requestNotificationPermission(): Promise<boolean> {
  if (Capacitor.isNativePlatform()) {
    try {
      const result = await NativeNotifications.requestPermission();
      return result.granted;
    } catch {
      return false;
    }
  }
  if (typeof Notification === 'undefined') return false;
  try {
    if (Notification.permission === 'granted') return true;
    if (Notification.permission === 'denied') return false;
    const result = await Notification.requestPermission();
    return result === 'granted';
  } catch {
    return false;
  }
}

/** Posts a notification, no matter whether the app is open or in the tray. */
export async function showNotification(payload: NotificationPayload): Promise<void> {
  const channel = payload.channel ?? 'messages';

  if (Capacitor.isNativePlatform()) {
    try {
      await NativeNotifications.show({
        id: payload.id,
        title: payload.title,
        body: payload.body,
        channelId: CHANNEL_IDS[channel],
        matchId: payload.matchId,
      });
      return;
    } catch {
      return;
    }
  }

  if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
  try {
    // The service worker path is the one Android Chrome supports.
    if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
      const registration = await navigator.serviceWorker.ready;
      await registration.showNotification(payload.title, {
        body: payload.body,
        icon: '/icons/icon-192.png',
        badge: '/icons/icon-192.png',
        tag: payload.matchId ? `match-${payload.matchId}` : 'hobymine',
        data: { matchId: payload.matchId ?? '' },
      });
      return;
    }
    const notification = new Notification(payload.title, {
      body: payload.body,
      icon: '/icons/icon-192.png',
      badge: '/icons/icon-192.png',
      tag: payload.matchId ? `match-${payload.matchId}` : undefined,
    });
    notification.onclick = () => {
      window.focus();
      if (payload.matchId) {
        window.history.pushState({}, '', `/chat/${payload.matchId}`);
        window.dispatchEvent(new PopStateEvent('popstate'));
      }
      notification.close();
    };
  } catch {
    // Notifications are best effort.
  }
}

/** The chat the user tapped in the notification tray, if any. */
export async function getLaunchPayload(): Promise<LaunchPayload | null> {
  if (!Capacitor.isNativePlatform()) return null;
  try {
    const payload = await NativeNotifications.getLaunchPayload();
    return payload && payload.matchId ? payload : null;
  } catch {
    return null;
  }
}

export async function clearLaunchPayload(): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;
  try {
    await NativeNotifications.clearLaunchPayload();
  } catch {
    // Nothing to clear.
  }
}

/** True when the member wants alerts while the app is closed. */
export function backgroundAlertsEnabled(): boolean {
  if (typeof localStorage === 'undefined') return false;
  return localStorage.getItem(BACKGROUND_KEY) === '1';
}

/**
 * Starts or stops the Android background service that keeps the account
 * connected while the app is closed.
 */
export async function updateBackgroundAlerts(
  enabled: boolean,
  session?: { token: string; apiBase: string },
): Promise<void> {
  if (typeof localStorage !== 'undefined') {
    localStorage.setItem(BACKGROUND_KEY, enabled ? '1' : '0');
  }
  if (!Capacitor.isNativePlatform()) return;
  try {
    if (enabled) {
      if (session) await NativeNotifications.saveSession(session);
      await NativeNotifications.startBackgroundService();
    } else {
      await NativeNotifications.stopBackgroundService();
    }
  } catch {
    // The service is optional — the app still works without it.
  }
}

/** Tells the background service whether the app is currently on screen. */
export async function setAppVisible(visible: boolean): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;
  try {
    await NativeNotifications.setAppVisible({ visible });
  } catch {
    // Nothing to do.
  }
}

/** Stops the background service and forgets the stored session (on logout). */
export async function clearBackgroundSession(): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;
  try {
    await NativeNotifications.stopBackgroundService();
    await NativeNotifications.clearSession();
  } catch {
    // Nothing to clean up.
  }
}
