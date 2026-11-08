import { Capacitor, registerPlugin } from '@capacitor/core';

interface CallAudioPlugin {
  startRingtone(): Promise<void>;
  stopRingtone(): Promise<void>;
}

interface AudioRoutePlugin {
  setAudioRoute(options: { speaker: boolean }): Promise<void>;
  resetAudioRoute(): Promise<void>;
}

/**
 * Native Android helper (HobymineNotifications) that plays the device's real
 * ringtone and vibration pattern. The web build falls back to synthesised
 * tones through Web Audio.
 */
const NativeCallAudio = registerPlugin<CallAudioPlugin>('HobymineNotifications');

/**
 * Native Android helper (HobymineAudio) that switches the call between the
 * built-in earpiece and the loudspeaker. Browsers only get a best-effort sink
 * selection because they usually do not expose the phone's earpiece.
 */
const NativeAudioRoute = registerPlugin<AudioRoutePlugin>('HobymineAudio');

interface RingPattern {
  frequencies: number[];
  onMs: number;
  offMs: number;
  volume: number;
  /** Vibration pattern for browsers that expose the Vibration API. */
  vibrate?: number[];
}

const OUTGOING_RINGBACK: RingPattern = {
  frequencies: [440, 480],
  onMs: 1800,
  offMs: 2200,
  volume: 0.075,
};

const INCOMING_RINGTONE: RingPattern = {
  frequencies: [640, 880],
  onMs: 900,
  offMs: 1400,
  volume: 0.11,
  vibrate: [0, 450, 500, 450],
};

class CallAudio {
  private context: AudioContext | null = null;
  private timer: number | undefined;
  private generation = 0;

  /**
   * Creates and unlocks the audio context from the click that starts the call.
   * Called before the asynchronous microphone prompt so mobile browsers keep
   * the user's audio permission for the ringback that follows.
   */
  prepare(): void {
    const context = this.ensureContext();
    if (!context) return;
    if (context.state === 'suspended') {
      void context.resume().catch(() => undefined);
    }
  }

  /** Play the dial tone while the other person's phone is ringing. */
  startOutgoing(): void {
    this.stop();
    this.startWebTone(OUTGOING_RINGBACK);
  }

  /**
   * Ring for an incoming call. On Android this uses the system ringtone and
   * vibration so it sounds like a real call; the browser gets a fallback.
   */
  async startIncoming(): Promise<void> {
    this.stop();
    const generation = this.generation;

    if (Capacitor.isNativePlatform()) {
      try {
        await NativeCallAudio.startRingtone();
        // A decline can land while the native call is starting.
        if (this.generation !== generation) {
          await NativeCallAudio.stopRingtone().catch(() => undefined);
        }
        return;
      } catch {
        // Fall through to the Web Audio ringtone.
      }
    }

    if (this.generation !== generation) return;
    this.startWebTone(INCOMING_RINGTONE);
  }

  /** Stop whichever call sound is playing. Safe to call repeatedly. */
  stop(): void {
    this.generation += 1;
    if (this.timer !== undefined) {
      window.clearInterval(this.timer);
      this.timer = undefined;
    }
    if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
      navigator.vibrate(0);
    }
    if (Capacitor.isNativePlatform()) {
      void NativeCallAudio.stopRingtone().catch(() => undefined);
    }
  }

  private ensureContext(): AudioContext | null {
    if (typeof window === 'undefined') return null;
    if (this.context) return this.context;
    const AudioContextConstructor =
      window.AudioContext ??
      (window as typeof window & { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;
    if (!AudioContextConstructor) return null;
    try {
      this.context = new AudioContextConstructor();
    } catch {
      this.context = null;
    }
    return this.context;
  }

  private startWebTone(pattern: RingPattern): void {
    const context = this.ensureContext();
    if (!context) return;
    if (context.state === 'suspended') {
      void context.resume().catch(() => undefined);
    }

    const playCycle = (): void => {
      this.playPattern(pattern);
      if (
        pattern.vibrate &&
        typeof navigator !== 'undefined' &&
        typeof navigator.vibrate === 'function'
      ) {
        navigator.vibrate(pattern.vibrate);
      }
    };

    playCycle();
    this.timer = window.setInterval(playCycle, pattern.onMs + pattern.offMs);
  }

  private playPattern(pattern: RingPattern): void {
    const context = this.context;
    if (!context) return;
    if (context.state === 'suspended') {
      void context.resume().catch(() => undefined);
    }

    const start = context.currentTime + 0.02;
    const end = start + pattern.onMs / 1000;
    const gain = context.createGain();
    gain.gain.setValueAtTime(0, start);
    gain.gain.linearRampToValueAtTime(pattern.volume, start + 0.04);
    gain.gain.setValueAtTime(pattern.volume, Math.max(start + 0.05, end - 0.08));
    gain.gain.linearRampToValueAtTime(0, end);
    gain.connect(context.destination);

    for (const frequency of pattern.frequencies) {
      const oscillator = context.createOscillator();
      oscillator.type = 'sine';
      oscillator.frequency.setValueAtTime(frequency, start);
      oscillator.connect(gain);
      oscillator.start(start);
      oscillator.stop(end + 0.02);
    }
  }
}

/**
 * Route the remote call audio to the earpiece (speaker = false) or the
 * loudspeaker (speaker = true). On Android the native plugin also restores the
 * previous audio mode when the call ends.
 */
export function setCallAudioRoute(speaker: boolean): void {
  if (Capacitor.getPlatform() === 'android') {
    void NativeAudioRoute.setAudioRoute({ speaker }).catch(() => undefined);
    return;
  }
  void applyWebAudioRoute(speaker);
}

export function resetCallAudioRoute(): void {
  if (Capacitor.getPlatform() !== 'android') return;
  void NativeAudioRoute.resetAudioRoute().catch(() => undefined);
}

/**
 * Chrome on desktop exposes separate output devices, so try to match the
 * requested route there. Mobile browsers generally return only "default" and
 * this quietly leaves the system route untouched.
 */
async function applyWebAudioRoute(speaker: boolean): Promise<void> {
  if (typeof document === 'undefined' || !navigator.mediaDevices?.enumerateDevices) return;
  const audio = document.querySelector<HTMLAudioElement>(
    'audio[id^="hobymine-call-audio-"]',
  );
  if (!audio || typeof audio.setSinkId !== 'function') return;

  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    const wanted = speaker ? /(speaker|loudspeaker)/i : /(earpiece|ear speaker|receiver)/i;
    const output = devices.find(
      (device) => device.kind === 'audiooutput' && wanted.test(device.label),
    );
    if (output) await audio.setSinkId(output.deviceId);
  } catch {
    // Routing is a progressive enhancement in the browser.
  }
}

export const callAudio = new CallAudio();
