import { AnimatePresence, motion } from 'framer-motion';
import {
  Ear,
  Loader2,
  Maximize2,
  Mic,
  MicOff,
  Phone,
  PhoneOff,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  SwitchCamera,
  UserRound,
  Video,
  VideoOff,
  Volume2,
  Zap,
} from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { acquireCaptureGuard, isAndroidNative } from '../../lib/captureGuard';
import { callManager } from '../../lib/callManager';
import { cn } from '../../lib/utils';
import { useCallStore } from '../../store/call';
import { Avatar } from '../Avatar';

function formatDuration(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return `${minutes}:${String(rest).padStart(2, '0')}`;
}

/** `0.5` → `0.5x`, `1` → `1x`, `1.5` → `1.5x`. */
function formatZoom(value: number): string {
  const rounded = Math.round(value * 10) / 10;
  return `${Number.isInteger(rounded) ? rounded.toFixed(0) : rounded.toFixed(1)}x`;
}

/** Zoom chips for the rear camera, filtered to what the device supports. */
function zoomPresets(range: { min: number; max: number }): number[] {
  const presets = [0.5, 1, 2, 3].filter(
    (value) => value >= range.min - 0.001 && value <= range.max + 0.001,
  );
  // Always offer the default field of view, even on unusual zoom ranges.
  if (!presets.includes(1)) presets.push(1);
  return presets.sort((a, b) => a - b);
}

/** How long the floating call controls stay on screen after they are shown. */
const CONTROLS_TIMEOUT = 2000;

export function VoiceCallOverlay() {
  const status = useCallStore((state) => state.status);
  const peer = useCallStore((state) => state.peer);
  const mode = useCallStore((state) => state.mode);
  const muted = useCallStore((state) => state.muted);
  const cameraOn = useCallStore((state) => state.cameraOn);
  const facingMode = useCallStore((state) => state.facingMode);
  const cameraSwitching = useCallStore((state) => state.cameraSwitching);
  const zoom = useCallStore((state) => state.zoom);
  const zoomRange = useCallStore((state) => state.zoomRange);
  const selfViewExpanded = useCallStore((state) => state.selfViewExpanded);
  const speakerOn = useCallStore((state) => state.speakerOn);
  const localStream = useCallStore((state) => state.localStream);
  const remoteStream = useCallStore((state) => state.remoteStream);
  const videoSecondsLimit = useCallStore((state) => state.videoSecondsLimit);
  const videoLimitReached = useCallStore((state) => state.videoLimitReached);
  const error = useCallStore((state) => state.error);
  const startedAt = useCallStore((state) => state.startedAt);
  const matchId = useCallStore((state) => state.matchId);
  const securityAlert = useCallStore((state) => state.securityAlert);
  const setCall = useCallStore((state) => state.setCall);
  const [elapsed, setElapsed] = useState(0);
  const [controlsVisible, setControlsVisible] = useState(true);
  const navigate = useNavigate();

  const remoteVideoRef = useRef<HTMLVideoElement | null>(null);
  const localVideoRef = useRef<HTMLVideoElement | null>(null);
  const hideTimerRef = useRef<number | null>(null);

  const clearHideTimer = useCallback(() => {
    if (hideTimerRef.current !== null) {
      window.clearTimeout(hideTimerRef.current);
      hideTimerRef.current = null;
    }
  }, []);

  const scheduleHide = useCallback(() => {
    clearHideTimer();
    hideTimerRef.current = window.setTimeout(() => {
      hideTimerRef.current = null;
      setControlsVisible(false);
    }, CONTROLS_TIMEOUT);
  }, [clearHideTimer]);

  const showControls = useCallback(() => {
    setControlsVisible(true);
    scheduleHide();
  }, [scheduleHide]);

  const toggleControls = useCallback(() => {
    if (controlsVisible) {
      clearHideTimer();
      setControlsVisible(false);
      return;
    }
    showControls();
  }, [controlsVisible, clearHideTimer, showControls]);

  useEffect(() => {
    if (status !== 'active' || !startedAt) {
      setElapsed(0);
      return;
    }
    const update = (): void => setElapsed(Math.floor((Date.now() - startedAt) / 1000));
    update();
    const timer = window.setInterval(update, 1000);
    return () => window.clearInterval(timer);
  }, [status, startedAt]);

  // Attach the WebRTC streams once the video elements are on screen.
  useEffect(() => {
    const remote = remoteVideoRef.current;
    if (remote && remoteStream) {
      remote.srcObject = remoteStream;
      void remote.play().catch(() => undefined);
    }
    const local = localVideoRef.current;
    if (local && localStream) {
      local.srcObject = localStream;
      void local.play().catch(() => undefined);
    }
  }, [remoteStream, localStream, status, mode]);

  // Hold the secure-window guard for the whole video call, from ringing through
  // the final frame. The chat underneath also holds it, but the video guard wins
  // when an attempt is reported so the peer gets the in-call banner.
  // Only the Android shell can block OS-level capture, so the indicator is
  // hidden in the browser even though the guard call itself is harmless.
  const captureAvailable = isAndroidNative();
  const captureProtected =
    captureAvailable &&
    mode === 'video' &&
    Boolean(matchId) &&
    status !== 'idle' &&
    status !== 'ended';
  useEffect(() => {
    if (!captureProtected || !matchId) return;
    return acquireCaptureGuard('video', { matchId, peerName: peer?.name });
  }, [captureProtected, matchId, peer?.name]);

  // The warning is a short-lived banner rather than a modal so it never blocks
  // the call controls.
  useEffect(() => {
    if (!securityAlert) return;
    const timer = window.setTimeout(() => setCall({ securityAlert: null }), 9000);
    return () => window.clearTimeout(timer);
  }, [securityAlert, setCall]);

  const visible = status !== 'idle';
  const isVideo = mode === 'video';
  const showVideoStage = isVideo && !videoLimitReached && (status === 'active' || status === 'connecting');
  const videoRemaining =
    videoSecondsLimit === null ? null : Math.max(0, videoSecondsLimit - elapsed);
  const peerFirstName = peer?.name.split(' ')[0] ?? (isVideo ? 'Video call' : 'Voice call');
  const zoomChips = zoomRange ? zoomPresets(zoomRange) : [];
  const showZoom =
    isVideo && status === 'active' && facingMode === 'environment' && zoomRange !== null;

  // The call opens with the controls on screen for a moment, then they fade
  // away. While connecting they stay put so ending the call is always one tap.
  useEffect(() => {
    if (!showVideoStage || status !== 'active') {
      clearHideTimer();
      setControlsVisible(true);
      return;
    }
    showControls();
    return clearHideTimer;
  }, [showVideoStage, status, clearHideTimer, showControls]);

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          /* The call screen is immersive, so it stays dark in either theme. */
          className={cn(
            'force-dark fixed inset-0 z-[70] flex flex-col bg-ink-950/95 backdrop-blur-xl',
            showVideoStage
              ? 'overflow-hidden'
              : 'items-center justify-center px-6 py-10 safe-top safe-bottom',
          )}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
          role="dialog"
          aria-modal="true"
          aria-label={isVideo ? 'Video call' : 'Voice call'}
        >
          <AnimatePresence>
            {securityAlert && (
              <motion.div
                key={`${securityAlert.kind}-${securityAlert.at}`}
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.18 }}
                style={{
                  top: 'calc(min(max(var(--safe-top, 0px), env(safe-area-inset-top, 0px)), 3.5rem) + 4rem)',
                }}
                className="pointer-events-none absolute inset-x-3 z-[60] mx-auto flex max-w-sm items-start gap-2.5 rounded-2xl border border-amber-400/35 bg-amber-400/15 px-3.5 py-3 text-left shadow-2xl backdrop-blur-xl"
                role="status"
                aria-live="assertive"
              >
                <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-amber-400/20 text-amber-300">
                  <ShieldAlert className="h-4 w-4" aria-hidden="true" />
                </span>
                <span className="min-w-0">
                  <span className="block text-[0.75rem] font-semibold text-amber-50">
                    {securityAlert.fromName} tried to{' '}
                    {securityAlert.kind === 'screen-recording'
                      ? 'record this call'
                      : 'screenshot this call'}
                  </span>
                  <span className="mt-0.5 block text-[0.625rem] leading-relaxed text-amber-100/80">
                    The capture was blocked before it could include your video.
                  </span>
                </span>
              </motion.div>
            )}
          </AnimatePresence>
          {videoLimitReached ? (
            <div className="relative flex w-full max-w-sm flex-col items-center px-6 text-center">
              <span className="grid h-16 w-16 place-items-center rounded-2xl border border-neon/30 bg-neon/10 text-neon">
                <Video className="h-8 w-8" />
              </span>
              <h2 className="mt-5 text-2xl font-black tracking-[-0.03em] text-white">
                Your free video minute is up
              </h2>
              <p className="mt-2 max-w-xs text-xs leading-relaxed text-ink-300">
                {peer ? `The call with ${peerFirstName} ended. ` : ''}
                HobyMine Plus unlocks unlimited 1-on-1 video calling, every day.
              </p>

              <div className="mt-6 w-full space-y-2">
                {[
                  'Unlimited 1-on-1 video calls',
                  'Unlimited likes and rewinds',
                  'See everyone who likes you',
                  'Read receipts and profile boost',
                ].map((benefit) => (
                  <div
                    key={benefit}
                    className="flex items-center gap-2.5 rounded-xl border border-white/[0.06] bg-white/[0.03] px-3.5 py-2.5 text-left"
                  >
                    <Sparkles className="h-3.5 w-3.5 shrink-0 text-neon" />
                    <span className="text-xs text-ink-200">{benefit}</span>
                  </div>
                ))}
              </div>

              <button
                type="button"
                onClick={() => {
                  callManager.dismissVideoLimit();
                  navigate('/plus');
                }}
                className="btn-primary mt-5 w-full"
              >
                <Zap className="h-4 w-4" />
                Get HobyMine Plus
              </button>
              <button
                type="button"
                onClick={() => callManager.dismissVideoLimit()}
                className="btn-ghost mt-2 w-full"
              >
                Maybe later
              </button>
            </div>
          ) : showVideoStage ? (
            <div className="relative h-full w-full overflow-hidden bg-ink-950">
              {/* Full-screen tap target: shows or hides the floating controls. */}
              <button
                type="button"
                onClick={toggleControls}
                className="absolute inset-0 z-0 h-full w-full cursor-default"
                aria-label={controlsVisible ? 'Hide call controls' : 'Show call controls'}
                tabIndex={-1}
              />

              <video
                ref={remoteVideoRef}
                autoPlay
                playsInline
                className={cn(
                  'pointer-events-none absolute bg-ink-950 object-cover transition-all duration-300 ease-out',
                  selfViewExpanded
                    ? 'right-3 top-[4.9rem] z-20 h-40 w-28 rounded-[1.35rem] border border-white/15 shadow-2xl sm:h-48 sm:w-36'
                    : 'inset-0 z-10 h-full w-full',
                )}
              />

              {(!remoteStream || status !== 'active') &&
                (selfViewExpanded ? (
                  <span className="pointer-events-none absolute right-3 top-[4.9rem] z-20 grid h-40 w-28 place-items-center rounded-[1.35rem] border border-white/15 bg-ink-900 text-ink-500 shadow-2xl sm:h-48 sm:w-36">
                    <UserRound className="h-6 w-6" />
                  </span>
                ) : (
                  <div className="pointer-events-none absolute inset-0 z-10 flex flex-col items-center justify-center bg-ink-950/80 px-6 text-center">
                    {peer ? (
                      <Avatar
                        name={peer.name}
                        photos={peer.photos}
                        id={peer.id}
                        size="2xl"
                        online={peer.online}
                      />
                    ) : (
                      <span className="flex h-24 w-24 items-center justify-center rounded-full border border-white/10 bg-white/[0.04]">
                        <UserRound className="h-10 w-10 text-ink-500" />
                      </span>
                    )}
                    <p className="mt-5 text-2xl font-black tracking-[-0.03em] text-white">
                      {peerFirstName}
                    </p>
                    <p className="mt-1.5 text-xs text-ink-400">
                      {status === 'connecting' ? 'Connecting…' : 'Waiting for video…'}
                    </p>
                  </div>
                ))}

              {/* Tapping the other person's tile brings them back to full screen. */}
              {selfViewExpanded && remoteStream && status === 'active' && (
                <button
                  type="button"
                  onClick={() => callManager.setSelfViewExpanded(false)}
                  className="absolute right-3 top-[4.9rem] z-20 flex h-40 w-28 items-end justify-end rounded-[1.35rem] bg-gradient-to-t from-ink-950/55 via-transparent to-transparent p-1.5 sm:h-48 sm:w-36"
                  aria-label={`Show ${peerFirstName} full screen`}
                >
                  <span className="grid h-6 w-6 place-items-center rounded-full bg-ink-950/60 text-white backdrop-blur">
                    <Maximize2 className="h-3 w-3" />
                  </span>
                </button>
              )}

              <div className="pointer-events-none absolute inset-x-0 top-0 z-30 flex items-start justify-between gap-2 px-4 pt-3 safe-top">
                <div className="flex min-w-0 items-center gap-2.5 rounded-full border border-white/10 bg-ink-950/40 py-1.5 pl-3 pr-3.5 shadow-lg backdrop-blur-xl">
                  <span
                    className={cn(
                      'h-1.5 w-1.5 shrink-0 rounded-full',
                      status === 'active' ? 'bg-neon' : 'animate-pulse bg-amber-400',
                    )}
                  />
                  <p className="truncate text-[0.8125rem] font-semibold tracking-[-0.01em] text-white">
                    {peer?.name ?? 'Video call'}
                  </p>
                  <span className="shrink-0 text-[0.6875rem] font-medium tabular-nums text-white/55">
                    {status === 'active' ? formatDuration(elapsed) : 'Connecting'}
                  </span>
                  {captureAvailable && (
                    <span
                      className="shrink-0 text-neon/80"
                      title="Screenshots and screen recording are blocked"
                      aria-label="Capture protection on"
                    >
                      <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
                    </span>
                  )}
                </div>
                {videoRemaining !== null && (
                  <span className="shrink-0 rounded-full border border-white/10 bg-ink-950/40 px-2.5 py-1.5 text-[0.625rem] font-semibold tabular-nums text-neon/90 backdrop-blur-xl">
                    {formatDuration(videoRemaining)} free
                  </span>
                )}
              </div>

              {localStream && (
                <button
                  type="button"
                  onClick={() => callManager.setSelfViewExpanded(true)}
                  className={cn(
                    'overflow-hidden bg-ink-900 transition-all duration-300 ease-out',
                    selfViewExpanded
                      ? 'pointer-events-none absolute inset-0 z-10 h-full w-full'
                      : 'absolute right-3 top-[4.9rem] z-20 h-40 w-28 rounded-[1.35rem] border border-white/15 shadow-2xl active:scale-[0.98] sm:h-48 sm:w-36',
                  )}
                  aria-label="Expand your video"
                  aria-pressed={selfViewExpanded}
                  tabIndex={selfViewExpanded ? -1 : 0}
                >
                  <video
                    ref={localVideoRef}
                    autoPlay
                    playsInline
                    muted
                    className={cn(
                      'h-full w-full object-cover',
                      // Selfie previews are mirrored, the rear camera is not.
                      facingMode === 'user' && '-scale-x-100',
                      !cameraOn && 'opacity-0',
                    )}
                  />
                  {!cameraOn && (
                    <span className="pointer-events-none absolute inset-0 grid place-items-center bg-ink-900 text-ink-400">
                      <span className="flex flex-col items-center gap-2">
                        <VideoOff className={selfViewExpanded ? 'h-10 w-10' : 'h-6 w-6'} />
                        {selfViewExpanded && (
                          <span className="text-xs font-medium text-ink-300">Camera is off</span>
                        )}
                      </span>
                    </span>
                  )}
                  {!selfViewExpanded && (
                    <span className="pointer-events-none absolute bottom-1.5 right-1.5 grid h-6 w-6 place-items-center rounded-full bg-ink-950/55 text-white/90 backdrop-blur">
                      <Maximize2 className="h-3 w-3" />
                    </span>
                  )}
                </button>
              )}

              <div
                className={cn(
                  'pointer-events-none absolute inset-x-0 bottom-0 z-30 bg-gradient-to-t from-ink-950/85 via-ink-950/30 to-transparent px-4 pb-3 pt-20 safe-bottom transition-opacity duration-300',
                  controlsVisible ? 'opacity-100' : 'opacity-0',
                )}
              >
                {showZoom && zoomRange && (
                  <div
                    onPointerDown={showControls}
                    className="mx-auto mb-2.5 flex w-[17rem] max-w-full flex-col gap-2 rounded-2xl border border-white/10 bg-ink-950/45 px-3.5 py-2.5 shadow-xl backdrop-blur-xl"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-[0.5625rem] font-semibold uppercase tracking-[0.16em] text-white/40">
                        Zoom
                      </span>
                      <span className="text-[0.6875rem] font-semibold tabular-nums text-white/85">
                        {formatZoom(zoom)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between gap-1">
                      {zoomChips.map((value) => {
                        const active = Math.abs(zoom - value) < 0.05;
                        return (
                          <button
                            key={value}
                            type="button"
                            onClick={() => callManager.setZoom(value)}
                            className={cn(
                              'h-7 flex-1 rounded-full text-[0.6875rem] font-semibold tabular-nums transition active:scale-95',
                              active
                                ? 'bg-white text-ink-950 shadow'
                                : 'text-white/70 hover:bg-white/10',
                            )}
                            aria-label={`${formatZoom(value)} zoom`}
                            aria-pressed={active}
                          >
                            {formatZoom(value)}
                          </button>
                        );
                      })}
                    </div>
                    <input
                      type="range"
                      min={zoomRange.min}
                      max={zoomRange.max}
                      step={zoomRange.step}
                      value={zoom}
                      onChange={(event) => {
                        showControls();
                        callManager.setZoom(Number(event.target.value));
                      }}
                      className="h-1 w-full cursor-pointer accent-neon"
                      aria-label="Camera zoom"
                    />
                  </div>
                )}
                <div
                  onPointerDown={showControls}
                  className={cn(
                    'mx-auto flex w-fit items-center gap-1.5 rounded-full border border-white/10 bg-ink-950/50 p-1.5 shadow-2xl backdrop-blur-2xl transition-transform duration-300 ease-out',
                    controlsVisible
                      ? 'pointer-events-auto translate-y-0'
                      : 'pointer-events-none translate-y-4',
                  )}
                >
                  <button
                    type="button"
                    onClick={() => callManager.toggleMute()}
                    className={cn(
                      'flex h-11 w-11 items-center justify-center rounded-full transition active:scale-95',
                      muted ? 'bg-white text-ink-950 shadow-lg' : 'text-white hover:bg-white/10',
                    )}
                    aria-label={muted ? 'Unmute microphone' : 'Mute microphone'}
                  >
                    {muted ? <MicOff className="h-5 w-5" /> : <Mic className="h-5 w-5" />}
                  </button>
                  <button
                    type="button"
                    onClick={() => callManager.toggleCamera()}
                    className={cn(
                      'flex h-11 w-11 items-center justify-center rounded-full transition active:scale-95',
                      cameraOn ? 'text-white hover:bg-white/10' : 'bg-white text-ink-950 shadow-lg',
                    )}
                    aria-label={cameraOn ? 'Turn camera off' : 'Turn camera on'}
                  >
                    {cameraOn ? <Video className="h-5 w-5" /> : <VideoOff className="h-5 w-5" />}
                  </button>
                  <button
                    type="button"
                    onClick={() => void callManager.switchCamera()}
                    disabled={cameraSwitching}
                    className="flex h-11 w-11 items-center justify-center rounded-full text-white transition active:scale-95 hover:bg-white/10 disabled:opacity-50"
                    aria-label={
                      facingMode === 'user' ? 'Switch to back camera' : 'Switch to front camera'
                    }
                    title={
                      facingMode === 'user' ? 'Switch to back camera' : 'Switch to front camera'
                    }
                  >
                    {cameraSwitching ? (
                      <Loader2 className="h-5 w-5 animate-spin" />
                    ) : (
                      <SwitchCamera className="h-5 w-5" />
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={() => callManager.hangUp()}
                    className="ml-0.5 flex h-11 w-14 items-center justify-center rounded-full bg-rose text-white shadow-lg transition active:scale-95"
                    aria-label="End call"
                  >
                    <PhoneOff className="h-5 w-5" />
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <div className="relative flex w-full max-w-sm flex-col items-center text-center">
              <div className="pointer-events-none absolute inset-0 overflow-hidden">
                <div className="absolute left-1/2 top-1/3 h-72 w-72 -translate-x-1/2 -translate-y-1/2 rounded-full bg-neon/10 blur-[5.625rem]" />
              </div>

              <div className="relative flex w-full flex-col items-center">
                <div className="relative">
                  {status === 'incoming' && (
                    <span className="absolute inset-0 animate-pulse-ring rounded-full border border-neon/40" />
                  )}
                  {peer ? (
                    <Avatar
                      name={peer.name}
                      photos={peer.photos}
                      id={peer.id}
                      size="2xl"
                      online={peer.online}
                    />
                  ) : (
                    <span className="flex h-24 w-24 items-center justify-center rounded-full border border-white/10 bg-white/[0.04]">
                      <UserRound className="h-10 w-10 text-ink-500" />
                    </span>
                  )}
                </div>

                <p className="mt-6 text-2xl font-black tracking-[-0.03em] text-white">
                  {peerFirstName}
                </p>
                <p className="mt-1.5 text-xs text-ink-400">
                  {status === 'incoming' &&
                    (isVideo ? 'Incoming video call…' : 'Incoming voice call…')}
                  {status === 'outgoing' && (isVideo ? 'Video calling…' : 'Calling…')}
                  {status === 'requesting' &&
                    (isVideo ? 'Connecting your camera…' : 'Connecting your microphone…')}
                  {status === 'connecting' && 'Connecting…'}
                  {status === 'active' && formatDuration(elapsed)}
                  {status === 'ended' && (error ?? 'Call ended')}
                </p>

                {status === 'connecting' && isVideo && videoRemaining !== null && (
                  <p className="mt-2 rounded-full border border-neon/25 bg-neon/[0.06] px-2.5 py-1 text-[0.625rem] font-semibold text-neon">
                    {formatDuration(videoRemaining)} free trial left
                  </p>
                )}

                <div className="mt-8 flex items-center gap-4">
                  {status === 'incoming' ? (
                    <>
                      <button
                        type="button"
                        onClick={() => callManager.decline()}
                        className="flex h-14 w-14 items-center justify-center rounded-full bg-rose text-white shadow-lg transition active:scale-95"
                        aria-label="Decline call"
                      >
                        <PhoneOff className="h-6 w-6" />
                      </button>
                      <button
                        type="button"
                        onClick={() => void callManager.accept()}
                        className="flex h-14 w-14 items-center justify-center rounded-full bg-neon text-ink-950 shadow-glow transition active:scale-95"
                        aria-label="Accept call"
                      >
                        {isVideo ? <Video className="h-6 w-6" /> : <Phone className="h-6 w-6" />}
                      </button>
                    </>
                  ) : status === 'active' ? (
                    <>
                      <button
                        type="button"
                        onClick={() => callManager.toggleMute()}
                        className={cn(
                          'flex h-14 w-14 items-center justify-center rounded-full transition active:scale-95',
                          muted
                            ? 'bg-rose text-white'
                            : 'border border-white/10 bg-white/[0.06] text-white',
                        )}
                        aria-label={muted ? 'Unmute microphone' : 'Mute microphone'}
                      >
                        {muted ? <MicOff className="h-6 w-6" /> : <Mic className="h-6 w-6" />}
                      </button>
                      <button
                        type="button"
                        onClick={() => callManager.toggleSpeaker()}
                        className={cn(
                          'flex h-14 w-14 items-center justify-center rounded-full transition active:scale-95',
                          speakerOn
                            ? 'bg-white text-ink-950 shadow-lg'
                            : 'border border-white/10 bg-white/[0.06] text-white',
                        )}
                        aria-label={speakerOn ? 'Switch to earpiece' : 'Switch to speaker'}
                        aria-pressed={speakerOn}
                        title={speakerOn ? 'Speaker on' : 'Earpiece'}
                      >
                        {speakerOn ? (
                          <Volume2 className="h-6 w-6" />
                        ) : (
                          <Ear className="h-6 w-6" />
                        )}
                      </button>
                      <button
                        type="button"
                        onClick={() => callManager.hangUp()}
                        className="flex h-14 w-14 items-center justify-center rounded-full bg-rose text-white shadow-lg transition active:scale-95"
                        aria-label="End call"
                      >
                        <PhoneOff className="h-6 w-6" />
                      </button>
                    </>
                  ) : status === 'ended' ? null : (
                    <button
                      type="button"
                      onClick={() => callManager.hangUp()}
                      className="flex h-14 w-14 items-center justify-center rounded-full bg-rose text-white shadow-lg transition active:scale-95"
                      aria-label="Cancel call"
                    >
                      <PhoneOff className="h-6 w-6" />
                    </button>
                  )}
                </div>

                {captureAvailable && isVideo && status !== 'ended' && (
                  <p className="mt-6 flex items-center gap-1.5 text-[0.6875rem] text-ink-500">
                    <ShieldCheck className="h-3 w-3 text-neon/70" aria-hidden="true" />
                    Screenshot and recording protection on
                  </p>
                )}

                {status === 'active' && !isVideo && (
                  <p className="mt-6 text-[0.6875rem] text-ink-500">
                    {speakerOn ? 'Speaker' : 'Earpiece'} · 1-on-1 call · direct connection
                  </p>
                )}
              </div>
            </div>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
