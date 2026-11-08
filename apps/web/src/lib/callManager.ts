import type { Socket } from 'socket.io-client';
import { toast } from 'sonner';
import { callAudio, resetCallAudioRoute, setCallAudioRoute } from './callAudio';
import { ensureCamera, ensureMicrophone } from './permissions';
import { getSocket } from './socket';
import { useCallStore, type CallMode, type CameraFacing, type ZoomRange } from '../store/call';
import { useChatStore } from '../store/chat';
import { useUiStore } from '../store/ui';
import type { PublicUser } from '../types';

const ICE_SERVERS: RTCIceServer[] = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
];

const RING_TIMEOUT_MS = 45_000;
/** How long a call may stay in "connecting" before it is given up on. */
const CONNECT_TIMEOUT_MS = 25_000;

const VIDEO_LIMIT_MESSAGE = 'Your free video minute is up';

function clampValue(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function roundToStep(value: number, step: number): number {
  if (!Number.isFinite(step) || step <= 0) return Math.round(value * 100) / 100;
  return Math.round((value + Number.EPSILON) / step) * step;
}

/**
 * Owns the WebRTC peer connection for 1-on-1 voice and video calls. The socket
 * only relays the offer/answer and ICE candidates; the audio (and camera) flow
 * peer to peer.
 */
class CallManager {
  private socket: Socket | null = null;
  private peer: RTCPeerConnection | null = null;
  private stream: MediaStream | null = null;
  /** Sender carrying the local camera track, kept so the camera can be flipped. */
  private videoSender: RTCRtpSender | null = null;
  /** Which camera is currently capturing; survives camera on/off toggles. */
  private facing: CameraFacing = 'user';
  private switchingCamera = false;
  /** Raw `zoom` capability of the active rear camera, in device units. */
  private zoomCapabilities: { min: number; max: number; step: number } | null = null;
  /** Device zoom value that corresponds to the "1x" field of view. */
  private zoomBaseline = 1;
  /** Latest zoom value waiting to be sent to the camera (coalesces slider drags). */
  private pendingZoom: number | null = null;
  private zoomApplying = false;
  /** Invalidates an in-flight zoom loop when the camera is replaced or the call ends. */
  private zoomSequence = 0;
  private pendingCandidates: RTCIceCandidateInit[] = [];
  /**
   * Signals that arrived before their invite was processed, keyed by call id.
   * The caller's offer is relayed as soon as it is created, which is often
   * before the async invite handler has rung this device; dropping those left
   * the callee with no offer and the call stuck on "Calling" forever.
   */
  private earlySignals = new Map<
    string,
    { description: RTCSessionDescriptionInit | null; candidates: RTCIceCandidateInit[] }
  >();
  private remoteReady = false;
  private pendingOffer: RTCSessionDescriptionInit | null = null;
  private userAccepted = false;
  private ringTimer: number | undefined;
  private connectTimer: number | undefined;
  private videoLimitTimer: number | undefined;

  bindSocket(socket: Socket): void {
    if (this.socket === socket) return;
    this.detachSocket();
    this.socket = socket;

    socket.on('call:incoming', (payload: {
      matchId?: string;
      callId?: string;
      fromUserId?: string;
      video?: boolean;
      videoSecondsLeft?: number | null;
    }) => {
      this.handleIncoming(payload);
    });
    socket.on('call:accepted', (payload: { matchId?: string; callId?: string }) => {
      this.handleAccepted(payload);
    });
    socket.on('call:declined', () => {
      // The other person rejected the call; it becomes a "No answer" card.
      this.finish('No answer', 'ended');
    });
    socket.on(
      'call:ended',
      (payload: { connected?: boolean; limitReached?: boolean } | null) => {
        // The server cut a video call at the end of the free minute.
        if (payload?.limitReached) {
          this.finishVideoLimit(false);
          return;
        }
        // A call that never connected was missed: say so before closing.
        if (payload?.connected === false) {
          this.finish('Missed call', 'ended');
          return;
        }
        this.finish('Call ended', 'idle');
      },
    );
    socket.on('call:video-limit', (payload: { callId?: string } | null) => {
      const state = useCallStore.getState();
      if (payload?.callId && state.callId !== payload.callId) return;
      this.finishVideoLimit(false);
    });
    socket.on('call:error', (payload: {
      reason?: string;
      recipient?: boolean;
      videoAllowance?: unknown;
    }) => {
      const reason = payload?.reason;
      if (reason === 'busy') {
        this.finish('They are already on a call', 'idle');
        return;
      }
      if (reason === 'limit') {
        this.finish('Daily free call limit reached', 'idle');
        toast.error('Daily free call limit reached', {
          description: 'HobyMine Plus members can call without limits.',
        });
        return;
      }
      if (reason === 'video_limit') {
        this.finish('Video calling needs Plus', 'idle');
        toast.error(
          payload?.recipient
            ? 'They have used their free video minute'
            : 'Your free video minute is used up',
          {
            description: 'HobyMine Plus unlocks unlimited 1-on-1 video calling.',
          },
        );
        useUiStore.getState().openPaywall({ reason: 'video_limit' });
        return;
      }
      this.finish('Calls are not available here', 'idle');
    });
    socket.on(
      'call:signal',
      (payload: {
        matchId?: string;
        callId?: string;
        description?: RTCSessionDescriptionInit | null;
        candidate?: RTCIceCandidateInit | null;
      }) => {
        void this.handleSignal(payload);
      },
    );
  }

  private detachSocket(): void {
    if (!this.socket) return;
    this.socket.off('call:incoming');
    this.socket.off('call:accepted');
    this.socket.off('call:declined');
    this.socket.off('call:ended');
    this.socket.off('call:video-limit');
    this.socket.off('call:error');
    this.socket.off('call:signal');
    this.socket = null;
  }

  private setCall(patch: Partial<ReturnType<typeof useCallStore.getState>>): void {
    useCallStore.getState().setCall(patch);
  }

  private peerFor(userId?: string): PublicUser | null {
    if (!userId) return null;
    const conversations = useChatStore.getState().conversations;
    return conversations.find((conversation) => conversation.user.id === userId)?.user ?? null;
  }

  private createPeerConnection(): RTCPeerConnection {
    const peer = new RTCPeerConnection({ iceServers: ICE_SERVERS });

    peer.onicecandidate = (event) => {
      const state = useCallStore.getState();
      if (!event.candidate || !state.callId || !state.matchId) return;
      this.socket?.emit('call:signal', {
        matchId: state.matchId,
        callId: state.callId,
        candidate: event.candidate.toJSON(),
      });
    };

    peer.onconnectionstatechange = () => {
      if (peer.connectionState === 'connected') {
        this.clearRingTimer();
        this.clearConnectTimer();
        callAudio.stop();
        if (useCallStore.getState().status !== 'active') {
          this.setCall({ status: 'active', startedAt: Date.now() });
        }
        // WebRTC may claim the audio route when it connects, so apply the
        // selected earpiece/speaker route once the call is live.
        setCallAudioRoute(useCallStore.getState().speakerOn);
        this.startVideoLimitTimer();
      }
      if (
        peer.connectionState === 'failed' ||
        peer.connectionState === 'disconnected' ||
        peer.connectionState === 'closed'
      ) {
        if (useCallStore.getState().status === 'active') {
          this.finish('Call ended', 'idle');
        }
      }
    };

    peer.ontrack = (event) => {
      const remote = event.streams[0] ?? new MediaStream([event.track]);
      this.setCall({ remoteStream: remote });
      if (useCallStore.getState().mode === 'video') {
        // The full-screen <video> element in the call overlay plays both the
        // picture and the sound, so no hidden audio element is needed.
        return;
      }
      const audio = document.createElement('audio');
      audio.srcObject = remote;
      audio.autoplay = true;
      audio.setAttribute('playsinline', 'true');
      audio.id = `hobymine-call-audio-${useCallStore.getState().callId ?? 'remote'}`;
      document.body.appendChild(audio);
      void audio.play().catch(() => undefined);
      setCallAudioRoute(useCallStore.getState().speakerOn);
    };

    return peer;
  }

  /**
   * Camera constraints shared by the initial capture and the flip-camera swap.
   *
   * `zoom: true` is not decoration: Chromium only grants camera PTZ access when
   * it is requested in `getUserMedia`, and without that grant the track exposes
   * no `zoom` capability and rejects zoom constraints. It is therefore needed
   * for the zoom bar (and 0.5x ultra-wide) to appear at all.
   */
  private videoConstraints(facing: CameraFacing, requestZoom = true): MediaTrackConstraints {
    const constraints = {
      facingMode: { ideal: facing },
      width: { ideal: 1280 },
      height: { ideal: 720 },
      frameRate: { ideal: 24, max: 30 },
    } as MediaTrackConstraints & { zoom?: boolean };
    if (requestZoom) constraints.zoom = true;
    return constraints;
  }

  /**
   * Opens just the camera (no microphone). Tries the exact lens first, then a
   * preference, and finally drops the zoom request so a denied PTZ prompt can
   * never cost the user their camera mid-call.
   */
  private async openCamera(facing: CameraFacing): Promise<MediaStream | null> {
    const attempts: MediaTrackConstraints[] = [
      // `exact` asks the OS for that specific lens; if the device has no such
      // camera it throws instead of silently handing back the same one.
      { ...this.videoConstraints(facing), facingMode: { exact: facing } },
      // Some WebViews report no facingMode in their capabilities, so fall back
      // to a preference and let the device pick the closest camera.
      this.videoConstraints(facing),
      // Last resort: keep the camera even when zoom/PTZ access was refused.
      this.videoConstraints(facing, false),
    ];

    for (const video of attempts) {
      try {
        return await navigator.mediaDevices.getUserMedia({ audio: false, video });
      } catch {
        // Try the next, less specific set of constraints.
      }
    }
    return null;
  }

  /** Number of cameras the device exposes, or `null` when it cannot be read. */
  private async cameraCount(): Promise<number | null> {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      return devices.filter((device) => device.kind === 'videoinput').length;
    } catch {
      return null;
    }
  }

  /**
   * Reads the zoom (and therefore ultra-wide) capabilities of the active
   * camera. Only the rear camera exposes controls in the UI, so the front
   * camera simply clears them.
   *
   * Chromium reports `zoom.min` below 1 on phones whose rear camera is a
   * logical multi-camera (wide + ultra-wide): 0.5 then means the ultra-wide
   * lens. Devices with a fixed lens report no zoom capability at all, and the
   * controls stay hidden.
   */
  private configureZoom(track: MediaStreamTrack | null): void {
    const state = useCallStore.getState();
    this.zoomSequence += 1;
    this.pendingZoom = null;
    this.zoomApplying = false;

    if (!track || state.mode !== 'video' || state.facingMode !== 'environment') {
      this.zoomCapabilities = null;
      this.zoomBaseline = 1;
      if (state.zoomRange !== null) this.setCall({ zoomRange: null });
      return;
    }

    let capabilities:
      | (MediaTrackCapabilities & { zoom?: { min?: number; max?: number; step?: number } })
      | undefined;
    try {
      capabilities = track.getCapabilities?.() as typeof capabilities;
    } catch {
      // A WebView that cannot describe the track simply gets no zoom controls.
      capabilities = undefined;
    }
    const zoom = capabilities?.zoom;
    const hasZoom =
      zoom !== undefined &&
      typeof zoom.min === 'number' &&
      typeof zoom.max === 'number' &&
      Number.isFinite(zoom.min) &&
      Number.isFinite(zoom.max) &&
      zoom.max > zoom.min;

    if (!hasZoom) {
      this.zoomCapabilities = null;
      this.zoomBaseline = 1;
      this.setCall({ zoomRange: null });
      return;
    }

    const min = zoom.min as number;
    const max = zoom.max as number;
    const rawStep = typeof zoom.step === 'number' && zoom.step > 0 ? zoom.step : 0.1;
    // "1x" is the camera's default field of view. Most devices report zoom
    // starting at 1, but a few use other units, so normalise around it.
    const baseline = min <= 1 && max >= 1 ? 1 : min;
    const range: ZoomRange = {
      min: Math.round((min / baseline) * 100) / 100,
      max: Math.round((max / baseline) * 100) / 100,
      step: Math.max(Math.round((rawStep / baseline) * 100) / 100, 0.01),
    };

    this.zoomCapabilities = { min, max, step: rawStep };
    this.zoomBaseline = baseline;

    const next = clampValue(roundToStep(state.zoom, range.step), range.min, range.max);
    this.setCall({ zoomRange: range, zoom: next });
    // Re-apply the chosen zoom on the freshly opened camera: `1x` is the
    // default field of view, so only anything away from it needs a constraint.
    if (Math.abs(next - 1) > 0.001) this.applyZoom(track, next);
  }

  /**
   * Sends one absolute zoom value. Chromium documents camera zoom through the
   * advanced PTZ constraint set, but some WebView builds only honour it in the
   * basic set, so both are tried and the result is verified with `getSettings`.
   */
  private async pushZoom(track: MediaStreamTrack, absolute: number): Promise<void> {
    try {
      await track.applyConstraints({
        advanced: [{ zoom: absolute } as unknown as MediaTrackConstraintSet],
      });
    } catch {
      // Fall through to the basic form below.
    }

    let applied: number | undefined;
    try {
      applied = (track.getSettings() as MediaTrackSettings & { zoom?: number }).zoom;
    } catch {
      applied = undefined;
    }
    if (typeof applied === 'number' && Math.abs(applied - absolute) < 0.01) return;

    try {
      await track.applyConstraints({
        zoom: { ideal: absolute },
      } as unknown as MediaTrackConstraints);
    } catch {
      // A camera that refuses the constraint keeps its previous zoom.
    }
  }

  /**
   * Coalesces rapid slider updates so the camera is not flooded with
   * `applyConstraints` calls: only the newest value is sent once the previous
   * request has settled.
   */
  private applyZoom(track: MediaStreamTrack, multiplier: number): void {
    const capabilities = this.zoomCapabilities;
    if (!capabilities) return;

    this.pendingZoom = clampValue(
      multiplier * this.zoomBaseline,
      capabilities.min,
      capabilities.max,
    );
    if (this.zoomApplying) return;

    this.zoomApplying = true;
    const token = ++this.zoomSequence;
    void (async () => {
      while (token === this.zoomSequence && this.pendingZoom !== null) {
        const absolute = this.pendingZoom;
        this.pendingZoom = null;
        await this.pushZoom(track, absolute);
      }
      // A newer loop (camera flip or a new call) owns the flags from here on.
      if (token === this.zoomSequence) {
        this.pendingZoom = null;
        this.zoomApplying = false;
      }
    })();
  }

  /**
   * Sets the rear-camera zoom. Values are multipliers of the default field of
   * view: `0.5` is ultra-wide (when the device supports it), `1` normal, `2`
   * twice as close. The UI only calls this when zoom support was detected.
   */
  setZoom(multiplier: number): void {
    const state = useCallStore.getState();
    const range = state.zoomRange;
    if (state.mode !== 'video' || state.facingMode !== 'environment' || !range) return;
    if (!Number.isFinite(multiplier)) return;

    const next = clampValue(roundToStep(multiplier, range.step), range.min, range.max);
    if (Math.abs(next - state.zoom) < 0.001) return;

    this.setCall({ zoom: next });
    const track = this.stream?.getVideoTracks()[0] ?? this.videoSender?.track ?? null;
    if (track) this.applyZoom(track, next);
  }

  /** Adds the local tracks to a fresh peer connection and remembers the video sender. */
  private addLocalTracks(peerConnection: RTCPeerConnection): void {
    const stream = this.stream;
    if (!stream) return;
    this.videoSender = null;
    for (const track of stream.getTracks()) {
      const sender = peerConnection.addTrack(track, stream);
      if (track.kind === 'video') this.videoSender = sender;
    }
  }

  private async getLocalStream(mode: CallMode): Promise<MediaStream | null> {
    if (mode === 'video') {
      const camera = await ensureCamera();
      if (!camera.granted) {
        toast.error(
          camera.reason === 'unavailable'
            ? 'No camera available'
            : 'Camera access is needed for video calls',
          {
            description:
              camera.reason === 'unavailable'
                ? 'This device does not expose a camera for video calls.'
                : 'Enable the camera permission in Android settings and try again.',
          },
        );
        return null;
      }
    }

    const permission = await ensureMicrophone();
    if (!permission.granted) {
      if (permission.reason === 'unavailable') {
        toast.error('No microphone available', {
          description: 'This device does not expose a microphone for calls.',
        });
      } else {
        toast.error('Microphone access is needed for calls', {
          description: 'Enable the microphone permission in Android settings and try again.',
        });
      }
      return null;
    }

    const audio = { echoCancellation: true, noiseSuppression: true, autoGainControl: true };

    if (mode !== 'video') {
      try {
        return await navigator.mediaDevices.getUserMedia({ audio, video: false });
      } catch {
        toast.error('Could not open the microphone');
        return null;
      }
    }

    try {
      return await navigator.mediaDevices.getUserMedia({
        audio,
        video: this.videoConstraints('user'),
      });
    } catch {
      // The PTZ/zoom permission was denied: keep the video call working
      // (without the zoom controls) instead of failing the whole call.
      try {
        return await navigator.mediaDevices.getUserMedia({
          audio,
          video: this.videoConstraints('user', false),
        });
      } catch {
        toast.error('Could not open the camera and microphone');
        return null;
      }
    }
  }

  private clearRingTimer(): void {
    if (this.ringTimer) {
      window.clearTimeout(this.ringTimer);
      this.ringTimer = undefined;
    }
  }

  private clearConnectTimer(): void {
    if (this.connectTimer) {
      window.clearTimeout(this.connectTimer);
      this.connectTimer = undefined;
    }
  }

  private clearVideoLimitTimer(): void {
    if (this.videoLimitTimer) {
      window.clearTimeout(this.videoLimitTimer);
      this.videoLimitTimer = undefined;
    }
  }

  /**
   * Enforces the free video minute on the client as well, so the call ends even
   * if the server event is delayed. The server independently cuts and bills the
   * call, so the limit cannot be bypassed by editing the client.
   */
  private startVideoLimitTimer(): void {
    this.clearVideoLimitTimer();
    const state = useCallStore.getState();
    if (state.mode !== 'video' || state.videoSecondsLimit === null) return;
    const remaining = Math.max(0, state.videoSecondsLimit);
    if (remaining <= 0) {
      this.finishVideoLimit(true);
      return;
    }
    this.videoLimitTimer = window.setTimeout(() => {
      this.finishVideoLimit(true);
    }, remaining * 1000);
  }

  /** Give up on a call that never finishes connecting (blocked network, no route). */
  private startConnectTimer(): void {
    this.clearConnectTimer();
    this.connectTimer = window.setTimeout(() => {
      const status = useCallStore.getState().status;
      if (status === 'connecting' || status === 'outgoing') {
        this.finish('Call could not connect', 'ended', true);
      }
    }, CONNECT_TIMEOUT_MS);
  }

  private cleanup(): void {
    this.clearRingTimer();
    this.clearConnectTimer();
    this.clearVideoLimitTimer();
    callAudio.stop();
    resetCallAudioRoute();
    this.peer?.close();
    this.peer = null;
    this.stream?.getTracks().forEach((track) => track.stop());
    this.stream = null;
    this.videoSender = null;
    this.facing = 'user';
    this.switchingCamera = false;
    this.zoomCapabilities = null;
    this.zoomBaseline = 1;
    this.pendingZoom = null;
    this.zoomApplying = false;
    this.zoomSequence += 1;
    this.pendingCandidates = [];
    this.remoteReady = false;
    this.pendingOffer = null;
    this.userAccepted = false;
    this.setCall({
      localStream: null,
      remoteStream: null,
      cameraSwitching: false,
      zoom: 1,
      zoomRange: null,
      selfViewExpanded: false,
    });
    document.querySelectorAll('audio[id^="hobymine-call-audio-"]').forEach((node) => {
      const audio = node as HTMLAudioElement;
      audio.pause();
      audio.srcObject = null;
      audio.remove();
    });
  }

  /**
   * Closes the local call. `notifyServer` is only set for give-ups the server
   * cannot see (ring/connect timeouts), so the other side stops ringing and the
   * match is not left looking busy.
   */
  private finish(message: string, status: 'idle' | 'ended', notifyServer = false): void {
    const state = useCallStore.getState();
    if (state.status === 'idle') return;
    if (notifyServer && state.callId && state.matchId) {
      this.socket?.emit('call:end', {
        matchId: state.matchId,
        callId: state.callId,
        seconds: this.elapsedSeconds(),
      });
    }
    // The call is over: no buffered signal is worth keeping.
    this.earlySignals.clear();
    this.cleanup();
    this.setCall({ status, error: status === 'ended' ? message : null, videoLimitReached: false });
    if (status === 'ended') {
      window.setTimeout(() => {
        if (useCallStore.getState().status === 'ended') useCallStore.getState().reset();
      }, 1800);
    }
  }

  /**
   * Ends a video call when the free minute is spent and leaves the upgrade
   * prompt on screen. Unlike a normal ending, this state is not auto-dismissed.
   */
  private finishVideoLimit(notifyServer: boolean): void {
    const state = useCallStore.getState();
    if (state.status === 'idle' && !state.videoLimitReached) return;
    if (notifyServer && state.callId && state.matchId) {
      this.socket?.emit('call:end', {
        matchId: state.matchId,
        callId: state.callId,
        seconds: this.elapsedSeconds(),
        reason: 'video_limit',
      });
    }
    this.cleanup();
    this.setCall({
      status: 'ended',
      error: VIDEO_LIMIT_MESSAGE,
      videoLimitReached: true,
      muted: false,
      cameraOn: false,
      speakerOn: false,
    });
  }

  /** Start ringing the other person. */
  async startCall(
    matchId: string,
    peer: PublicUser,
    options: { mode?: CallMode; videoSecondsLeft?: number | null } = {},
  ): Promise<void> {
    const socket = this.socket ?? getSocket();
    if (!socket) {
      toast.error('Calls need a live connection — try again in a moment');
      return;
    }
    const current = useCallStore.getState();
    if (current.status !== 'idle' && current.status !== 'ended') {
      toast.error('You are already on a call');
      return;
    }

    const mode = options.mode ?? 'audio';
    this.cleanup();
    // Unlock audio while the tap that started the call is still active.
    callAudio.prepare();
    this.setCall({
      status: 'requesting',
      callId: null,
      matchId,
      peer,
      mode,
      cameraOn: mode === 'video',
      facingMode: 'user',
      cameraSwitching: false,
      muted: false,
      speakerOn: false,
      localStream: null,
      remoteStream: null,
      videoSecondsLimit: mode === 'video' ? (options.videoSecondsLeft ?? null) : null,
      videoLimitReached: false,
      error: null,
      startedAt: null,
    });

    const stream = await this.getLocalStream(mode);
    if (!stream) {
      this.setCall({ status: 'idle', mode: 'audio', cameraOn: false });
      return;
    }
    this.stream = stream;
    this.setCall({ localStream: stream });
    this.configureZoom(stream.getVideoTracks()[0] ?? null);

    const peerConnection = this.createPeerConnection();
    this.peer = peerConnection;
    this.addLocalTracks(peerConnection);

    const callId = `call_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    try {
      const offer = await peerConnection.createOffer();
      await peerConnection.setLocalDescription(offer);
      this.setCall({ status: 'outgoing', callId });
      callAudio.startOutgoing();
      socket.emit('call:invite', { matchId, callId, video: mode === 'video' });
      socket.emit('call:signal', { matchId, callId, description: offer });

      this.ringTimer = window.setTimeout(() => {
        if (useCallStore.getState().status === 'outgoing') {
          // Tell the server so it stops ringing the other phone and frees the
          // match; otherwise the next attempt was rejected as "already on a call".
          this.finish('No answer', 'ended', true);
        }
      }, RING_TIMEOUT_MS);
    } catch {
      this.finish('Could not start the call', 'ended');
    }
  }

  private handleIncoming(payload: {
    matchId?: string;
    callId?: string;
    fromUserId?: string;
    video?: boolean;
    videoSecondsLeft?: number | null;
  }): void {
    const state = useCallStore.getState();
    if (!payload?.matchId || !payload?.callId) return;
    if (state.status !== 'idle' && state.status !== 'ended') {
      this.socket?.emit('call:decline', { matchId: payload.matchId, callId: payload.callId });
      return;
    }
    const video = payload.video === true;
    this.cleanup();
    this.setCall({
      status: 'incoming',
      callId: payload.callId,
      matchId: payload.matchId,
      peer: this.peerFor(payload.fromUserId),
      mode: video ? 'video' : 'audio',
      cameraOn: video,
      facingMode: 'user',
      cameraSwitching: false,
      muted: false,
      speakerOn: false,
      localStream: null,
      remoteStream: null,
      videoSecondsLimit: video ? (payload.videoSecondsLeft ?? null) : null,
      videoLimitReached: false,
      error: null,
      startedAt: null,
    });
    void callAudio.startIncoming();
    // The offer may already be waiting: it is relayed as soon as it is created,
    // usually before this invite is processed.
    void this.drainEarlySignals(payload.callId);
    // Do not ring forever if the caller disappears without an event.
    this.ringTimer = window.setTimeout(() => {
      const current = useCallStore.getState();
      if (current.status !== 'incoming') return;
      if (current.callId && current.matchId) {
        this.socket?.emit('call:decline', {
          matchId: current.matchId,
          callId: current.callId,
        });
      }
      this.finish('Missed call', 'ended');
    }, RING_TIMEOUT_MS);
  }

  /** Answer an incoming call. */
  async accept(): Promise<void> {
    const state = useCallStore.getState();
    if (state.status !== 'incoming' || !state.callId || !state.matchId) return;
    const socket = this.socket ?? getSocket();
    if (!socket) return;

    this.clearRingTimer();
    callAudio.stop();
    this.userAccepted = true;
    this.setCall({ status: 'connecting' });
    this.startConnectTimer();
    const stream = await this.getLocalStream(state.mode);
    if (!stream) {
      this.userAccepted = false;
      // Release the caller's ring: it cannot connect without our microphone.
      socket.emit('call:decline', { matchId: state.matchId, callId: state.callId });
      this.setCall({ status: 'idle' });
      return;
    }
    this.stream = stream;
    this.setCall({ localStream: stream });
    this.configureZoom(stream.getVideoTracks()[0] ?? null);

    const peerConnection = this.createPeerConnection();
    this.peer = peerConnection;
    this.addLocalTracks(peerConnection);

    socket.emit('call:accept', { matchId: state.matchId, callId: state.callId });

    if (this.pendingOffer) {
      await this.answerWith(this.pendingOffer);
    }
  }

  private async answerWith(offer: RTCSessionDescriptionInit): Promise<void> {
    const state = useCallStore.getState();
    if (!this.peer || !state.matchId || !state.callId) return;
    try {
      await this.peer.setRemoteDescription(offer);
      this.remoteReady = true;
      await this.flushCandidates();
      const answer = await this.peer.createAnswer();
      await this.peer.setLocalDescription(answer);
      this.socket?.emit('call:signal', {
        matchId: state.matchId,
        callId: state.callId,
        description: answer,
      });
    } catch {
      this.finish('Could not connect the call', 'ended');
    }
  }

  private handleAccepted(payload: { matchId?: string; callId?: string }): void {
    const state = useCallStore.getState();
    if (!payload?.callId || state.callId !== payload.callId) return;
    this.clearRingTimer();
    callAudio.stop();
    this.startConnectTimer();
    this.setCall({ status: 'connecting' });
  }

  private async handleSignal(payload: {
    matchId?: string;
    callId?: string;
    description?: RTCSessionDescriptionInit | null;
    candidate?: RTCIceCandidateInit | null;
  }): Promise<void> {
    const state = useCallStore.getState();
    if (!payload?.callId) return;

    /*
     * The caller relays its offer the instant it is created, while `call:invite`
     * is still being handled on the server. A signal for a call this device has
     * not been told about yet is therefore normal, not stale: buffer it by call
     * id and replay it as soon as the invite (or the accept) sets that id.
     */
    if (state.callId !== payload.callId) {
      const known =
        state.status === 'idle' ||
        state.status === 'ended' ||
        state.status === 'incoming' ||
        state.callId === null;
      if (!known || !payload.matchId) return;
      const buffered =
        this.earlySignals.get(payload.callId) ??
        { description: null, candidates: [] };
      if (payload.description?.type === 'offer') buffered.description = payload.description;
      if (payload.candidate) buffered.candidates.push(payload.candidate);
      this.earlySignals.set(payload.callId, buffered);
      // Keep the buffer small; these are only ever seconds old.
      if (this.earlySignals.size > 6) {
        const oldest = this.earlySignals.keys().next().value;
        if (oldest && oldest !== payload.callId) this.earlySignals.delete(oldest);
      }
      return;
    }

    await this.applySignal(payload);
  }

  /** Applies a signal that belongs to the call currently on screen. */
  private async applySignal(payload: {
    description?: RTCSessionDescriptionInit | null;
    candidate?: RTCIceCandidateInit | null;
  }): Promise<void> {
    if (payload.description) {
      const description = payload.description;
      if (description.type === 'offer') {
        // The offer can arrive before the person accepts: keep it until then.
        this.pendingOffer = description;
        if (this.userAccepted) {
          await this.answerWith(description);
        }
        return;
      }
      if (description.type === 'answer' && this.peer) {
        try {
          await this.peer.setRemoteDescription(description);
          this.remoteReady = true;
          await this.flushCandidates();
        } catch {
          this.finish('Could not connect the call', 'ended', true);
        }
      }
      return;
    }

    if (payload.candidate) {
      if (this.remoteReady && this.peer) {
        try {
          await this.peer.addIceCandidate(payload.candidate);
        } catch {
          // A stale candidate is not fatal for the call.
        }
      } else {
        this.pendingCandidates.push(payload.candidate);
      }
    }
  }

  /** Replays the offer/ICE that arrived before this call was announced. */
  private async drainEarlySignals(callId: string): Promise<void> {
    const buffered = this.earlySignals.get(callId);
    if (!buffered) return;
    this.earlySignals.delete(callId);
    for (const candidate of buffered.candidates) this.pendingCandidates.push(candidate);
    if (buffered.description && !this.pendingOffer) {
      await this.applySignal({ description: buffered.description });
    }
  }

  private async flushCandidates(): Promise<void> {
    if (!this.peer) return;
    const queued = this.pendingCandidates;
    this.pendingCandidates = [];
    for (const candidate of queued) {
      try {
        await this.peer.addIceCandidate(candidate);
      } catch {
        // Ignore candidates that arrived too early.
      }
    }
  }

  /** Decline an incoming call. */
  decline(): void {
    const state = useCallStore.getState();
    if (state.callId && state.matchId) {
      this.socket?.emit('call:decline', { matchId: state.matchId, callId: state.callId });
    }
    this.cleanup();
    useCallStore.getState().reset();
  }

  /** End an active or outgoing call. */
  hangUp(): void {
    const state = useCallStore.getState();
    if (state.callId && state.matchId) {
      this.socket?.emit('call:end', {
        matchId: state.matchId,
        callId: state.callId,
        seconds: this.elapsedSeconds(),
      });
    }
    this.cleanup();
    this.setCall({ status: 'ended', error: 'Call ended', videoLimitReached: false });
    window.setTimeout(() => {
      if (useCallStore.getState().status === 'ended') useCallStore.getState().reset();
    }, 1800);
  }

  /** Seconds the current call has been running (for the daily talk budget). */
  private elapsedSeconds(): number {
    const startedAt = useCallStore.getState().startedAt;
    if (!startedAt) return 0;
    return Math.max(0, Math.round((Date.now() - startedAt) / 1000));
  }

  /** Switch the active call between the earpiece and the loudspeaker. */
  toggleSpeaker(): void {    const state = useCallStore.getState();
    if (state.status !== 'active') return;
    const speakerOn = !state.speakerOn;
    this.setCall({ speakerOn });
    setCallAudioRoute(speakerOn);
  }

  /** Mute or unmute the microphone. */
  toggleMute(): void {
    const state = useCallStore.getState();
    const muted = !state.muted;
    this.stream?.getAudioTracks().forEach((track) => {
      track.enabled = !muted;
    });
    this.setCall({ muted });
  }

  /** Turn the camera on or off during a video call. */
  toggleCamera(): void {
    const state = useCallStore.getState();
    if (state.mode !== 'video' || state.status !== 'active') return;
    const cameraOn = !state.cameraOn;
    this.stream?.getVideoTracks().forEach((track) => {
      track.enabled = cameraOn;
    });
    this.setCall({ cameraOn });
  }

  /**
   * Swaps the outgoing video track for the one from the other camera, keeping
   * the microphone, the peer connection and the call untouched.
   */
  private async applyVideoTrack(track: MediaStreamTrack): Promise<void> {
    const state = useCallStore.getState();
    if (this.videoSender) await this.videoSender.replaceTrack(track);

    const stream = this.stream;
    if (stream) {
      for (const existing of stream.getVideoTracks()) {
        if (existing === track) continue;
        stream.removeTrack(existing);
        if (existing.readyState === 'live') existing.stop();
      }
      stream.addTrack(track);
    }

    // Keep the local camera-off choice across the flip.
    track.enabled = state.cameraOn;
    this.setCall({ localStream: stream });
  }

  /** Reopens the camera that was in use when a flip has to be rolled back. */
  private async restoreCamera(facing: CameraFacing): Promise<void> {
    try {
      const restored = await this.openCamera(facing);
      const track = restored?.getVideoTracks()[0];
      if (track) {
        await this.applyVideoTrack(track);
        return;
      }
      restored?.getTracks().forEach((other) => other.stop());
    } catch {
      // Rolling back is best-effort: a failed flip must never end the call.
    }
  }

  /**
   * Flip between the front and rear camera during an active video call.
   *
   * The new camera is opened while the old one is still live, then its track is
   * handed to the existing RTP sender with `replaceTrack`. That avoids a full
   * renegotiation, so the call does not stutter, re-ring or reconnect: the
   * other person simply starts receiving the other camera. If a device refuses
   * to expose both cameras at once, the old track is released first and the
   * swap is retried; if that fails too, the original camera is restored so the
   * call keeps working.
   */
  async switchCamera(): Promise<boolean> {
    const state = useCallStore.getState();
    if (state.mode !== 'video' || state.status !== 'active') return false;
    // Ignore double taps while the camera hardware is switching.
    if (this.switchingCamera) return false;

    const previous = this.facing;
    const next: CameraFacing = previous === 'user' ? 'environment' : 'user';
    const currentTrack = this.stream?.getVideoTracks()[0] ?? this.videoSender?.track ?? null;
    const currentDeviceId = currentTrack?.getSettings().deviceId ?? null;

    // Do not disturb the live track when the device only has one lens.
    if ((await this.cameraCount()) === 1) {
      toast('This device has only one camera', {
        description: 'Flipping needs both a front and a rear camera.',
      });
      return false;
    }

    this.switchingCamera = true;
    this.setCall({ cameraSwitching: true });

    let releasedOldTrack = false;
    let nextStream: MediaStream | null = null;

    try {
      nextStream = await this.openCamera(next);
      if (!nextStream) {
        // Some Android WebViews refuse a second camera while the first is open.
        releasedOldTrack = true;
        currentTrack?.stop();
        nextStream = await this.openCamera(next);
      }

      const nextTrack = nextStream?.getVideoTracks()[0];
      if (!nextStream || !nextTrack) {
        if (releasedOldTrack) await this.restoreCamera(previous);
        toast.error('Could not switch camera', {
          description: 'The other camera did not open. Try again.',
        });
        return false;
      }

      const nextSettings = nextTrack.getSettings();
      const nextDeviceId = nextSettings.deviceId ?? null;
      const sameSensor =
        currentDeviceId && nextDeviceId
          ? currentDeviceId === nextDeviceId
          : // Without usable device IDs, fall back to the lens Chrome reports. If
            // it is not the one we asked for, the device could not switch.
            nextSettings.facingMode !== undefined && nextSettings.facingMode !== next;
      if (sameSensor) {
        // A single-camera device ignores `facingMode` and returns the same sensor.
        if (releasedOldTrack) await this.restoreCamera(previous);
        toast('This device has only one camera', {
          description: 'Flipping needs both a front and a rear camera.',
        });
        return false;
      }

      await this.applyVideoTrack(nextTrack);
      // The track now belongs to the call's stream; the finally block must not stop it.
      nextStream = null;
      this.facing = next;
      this.setCall({ facingMode: next });
      this.configureZoom(nextTrack);

      // Some Android WebViews publish the zoom capability a beat after the
      // rear camera opens. Re-check once so the controls are not lost to that
      // race; the guards make it a no-op if the user already flipped back.
      if (next === 'environment' && useCallStore.getState().zoomRange === null) {
        window.setTimeout(() => {
          const state = useCallStore.getState();
          if (state.mode !== 'video' || state.facingMode !== 'environment') return;
          if (state.status !== 'active' && state.status !== 'connecting') return;
          if (state.zoomRange !== null) return;
          const current = this.stream?.getVideoTracks()[0];
          if (current) this.configureZoom(current);
        }, 800);
      }
      return true;
    } catch {
      if (releasedOldTrack) await this.restoreCamera(previous);
      toast.error('Could not switch camera');
      return false;
    } finally {
      nextStream?.getTracks().forEach((track) => track.stop());
      this.switchingCamera = false;
      this.setCall({ cameraSwitching: false });
    }
  }

  /**
   * Picks which camera fills the call screen: `true` enlarges the local
   * self-view, `false` enlarges the other person. This is a one-way setter (not
   * a toggle) so a tap can never flip the layout by accident, and it only
   * changes the view: neither stream, the audio, nor the camera is touched.
   */
  setSelfViewExpanded(expanded: boolean): void {
    const state = useCallStore.getState();
    if (state.mode !== 'video') return;
    if (state.status !== 'active' && state.status !== 'connecting') return;
    if (state.selfViewExpanded === expanded) return;
    this.setCall({ selfViewExpanded: expanded });
  }

  /** Dismiss the video upgrade prompt after the free minute ended. */
  dismissVideoLimit(): void {
    this.cleanup();
    useCallStore.getState().reset();
  }
}

export const callManager = new CallManager();
