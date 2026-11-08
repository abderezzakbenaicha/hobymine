import { Capacitor, registerPlugin } from '@capacitor/core';

export type PermissionName = 'microphone' | 'camera' | 'photos';

export interface PermissionResult {
  granted: boolean;
  /** `denied` = the user refused, `unavailable` = no hardware or no API. */
  reason?: 'denied' | 'unavailable';
}

interface PermissionPlugin {
  check(options: { permission: PermissionName }): Promise<{ granted: boolean; state: string }>;
  request(options: { permission: PermissionName }): Promise<{ granted: boolean }>;
}

/**
 * Small native helper (see android/.../HobyminePermissions.java) that asks for
 * the Android runtime permissions the WebView needs before it can open the
 * microphone or the camera.
 */
const Permissions = registerPlugin<PermissionPlugin>('HobyminePermissions');

async function requestNative(
  permission: PermissionName,
): Promise<PermissionResult | null> {
  if (!Capacitor.isNativePlatform()) return null;
  try {
    const result = await Permissions.request({ permission });
    return { granted: result.granted, reason: result.granted ? undefined : 'denied' };
  } catch {
    // The plugin is not available in this build — fall back to the browser
    // prompt, which the WebView still routes through Android.
    return null;
  }
}

async function probe(kind: 'audio' | 'video'): Promise<PermissionResult> {
  if (!navigator.mediaDevices?.getUserMedia) return { granted: false, reason: 'unavailable' };
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: kind === 'audio',
      video: kind === 'video',
    });
    stream.getTracks().forEach((track) => track.stop());
    return { granted: true };
  } catch (error) {
    const name = error instanceof DOMException ? error.name : '';
    if (name === 'NotFoundError' || name === 'OverconstrainedError') {
      return { granted: false, reason: 'unavailable' };
    }
    if (name === 'NotAllowedError' || name === 'SecurityError') {
      return { granted: false, reason: 'denied' };
    }
    return { granted: false, reason: 'unavailable' };
  }
}

/** Ask for microphone access. */
export async function ensureMicrophone(): Promise<PermissionResult> {
  const native = await requestNative('microphone');
  if (native !== null) return native;
  return probe('audio');
}

/** Ask for camera access. */
export async function ensureCamera(): Promise<PermissionResult> {
  const native = await requestNative('camera');
  if (native !== null) return native;
  return probe('video');
}

/**
 * Ask for access to the photo library. The system picker does not need it on
 * modern Android, so a refusal is not fatal for uploading a picture.
 */
export async function ensurePhotoAccess(): Promise<PermissionResult> {
  const native = await requestNative('photos');
  if (native !== null) return native;
  return { granted: true };
}
