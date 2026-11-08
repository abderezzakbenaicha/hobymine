import { create } from 'zustand';
import type { CaptureAttemptKind, PublicUser } from '../types';

export type CallStatus =
  | 'idle'
  | 'requesting'
  | 'outgoing'
  | 'incoming'
  | 'connecting'
  | 'active'
  | 'ended';

export type CallMode = 'audio' | 'video';

/** Which physical camera is capturing the local video. */
export type CameraFacing = 'user' | 'environment';

/**
 * Zoom range reported by the active camera, in display units where `1` is the
 * camera's default field of view (`0.5` is ultra-wide, `2` is 2x).
 */
export interface ZoomRange {
  min: number;
  max: number;
  step: number;
}

/** A blocked capture attempt by the person on the other side of the call. */
export interface CallSecurityAlert {
  kind: CaptureAttemptKind;
  fromName: string;
  at: number;
}

interface CallState {
  status: CallStatus;
  callId: string | null;
  matchId: string | null;
  peer: PublicUser | null;
  /** Voice call or 1-on-1 video call. */
  mode: CallMode;
  muted: boolean;
  /** Camera on/off. Only meaningful for video calls. */
  cameraOn: boolean;
  /** Front (`user`) or rear (`environment`) camera. Only meaningful for video calls. */
  facingMode: CameraFacing;
  /** True while the local camera is being flipped, so the button can spin. */
  cameraSwitching: boolean;
  /**
   * Rear-camera zoom as a multiplier of the default field of view
   * (`0.5` ultra-wide, `1` normal, `2` 2x). Only meaningful when `zoomRange`
   * is set, which only happens when the rear camera reports zoom support.
   */
  zoom: number;
  /** Supported zoom multipliers for the active rear camera, or null when unsupported. */
  zoomRange: ZoomRange | null;
  /** True when the local self-view fills the call screen (WhatsApp-style swap). */
  selfViewExpanded: boolean;
  /** True when call audio is routed to the loudspeaker instead of the earpiece. */
  speakerOn: boolean;
  /** Local camera + microphone stream, attached to the self-preview. */
  localStream: MediaStream | null;
  /** The other person's stream, attached to the full-screen video. */
  remoteStream: MediaStream | null;
  /** Remaining free video seconds for this call. Null means unlimited. */
  videoSecondsLimit: number | null;
  /** True once the free video minute is used up (Plus upgrade prompt). */
  videoLimitReached: boolean;
  /** In-call notice that the other person tried to screenshot or record. */
  securityAlert: CallSecurityAlert | null;
  error: string | null;
  startedAt: number | null;
  setCall: (patch: Partial<CallState>) => void;
  reset: () => void;
}

const INITIAL = {
  status: 'idle' as CallStatus,
  callId: null,
  matchId: null,
  peer: null,
  mode: 'audio' as CallMode,
  muted: false,
  cameraOn: false,
  facingMode: 'user' as CameraFacing,
  cameraSwitching: false,
  zoom: 1,
  zoomRange: null as ZoomRange | null,
  selfViewExpanded: false,
  speakerOn: false,
  localStream: null,
  remoteStream: null,
  videoSecondsLimit: null,
  videoLimitReached: false,
  securityAlert: null as CallSecurityAlert | null,
  error: null,
  startedAt: null,
};

export const useCallStore = create<CallState>((set) => ({
  ...INITIAL,
  setCall: (patch) => set(patch),
  reset: () => set(INITIAL),
}));
