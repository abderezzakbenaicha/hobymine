import { Pause, Play, AlertTriangle } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { cn, formatDuration } from '../../lib/utils';

const WAVE = [8, 14, 10, 22, 16, 28, 18, 12, 24, 32, 20, 14, 26, 18, 10, 22, 30, 16, 12, 20, 26, 14, 9, 18, 24, 12, 8, 16, 22, 10, 6, 12];

export function VoiceMessage({
  src,
  duration,
  isMine,
}: {
  src: string | null;
  duration: number | null;
  isMine: boolean;
}) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const [loadedDuration, setLoadedDuration] = useState(duration ?? 0);
  const [failed, setFailed] = useState(false);
  const [loading, setLoading] = useState(false);
  const objectUrlRef = useRef<string | null>(null);

  useEffect(() => {
    setFailed(false);
    setPlaying(false);
    setProgress(0);
    setElapsed(0);
    setLoading(false);
  }, [src]);

  useEffect(() => {
    return () => {
      audioRef.current?.pause();
      if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
    };
  }, []);

  /**
   * Some Android WebViews refuse to stream a cross origin audio file. When
   * that happens the clip is fetched into memory and played from a blob URL,
   * which always works.
   */
  const playFromBlob = async (): Promise<boolean> => {
    if (!src) return false;
    try {
      const response = await fetch(src);
      if (!response.ok) return false;
      const blob = await response.blob();
      if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
      const url = URL.createObjectURL(blob);
      objectUrlRef.current = url;
      const audio = audioRef.current;
      if (!audio) return false;
      audio.src = url;
      audio.load();
      await audio.play();
      setPlaying(true);
      setFailed(false);
      return true;
    } catch {
      return false;
    }
  };

  const toggle = async (): Promise<void> => {
    const audio = audioRef.current;
    if (!audio || failed) return;
    if (audio.paused) {
      setLoading(true);
      if (audio.readyState === 0) {
        audio.load();
        await new Promise<void>((resolve) => {
          const done = (): void => {
            audio.removeEventListener('loadedmetadata', done);
            audio.removeEventListener('error', done);
            resolve();
          };
          audio.addEventListener('loadedmetadata', done);
          audio.addEventListener('error', done);
          setTimeout(done, 2500);
        });
      }
      try {
        await audio.play();
        setPlaying(true);
      } catch {
        const recovered = await playFromBlob();
        if (!recovered) {
          setFailed(true);
          setPlaying(false);
        }
      } finally {
        setLoading(false);
      }
    } else {
      audio.pause();
      setPlaying(false);
    }
  };

  const onTimeUpdate = (): void => {
    const audio = audioRef.current;
    if (!audio) return;
    const total = audio.duration && Number.isFinite(audio.duration) ? audio.duration : loadedDuration;
    setElapsed(audio.currentTime);
    setProgress(total > 0 ? Math.min(1, audio.currentTime / total) : 0);
  };

  const total = loadedDuration || duration || 0;
  const shown = playing || elapsed > 0 ? formatDuration(elapsed) : formatDuration(total);

  return (
    <div className="flex min-w-[11.875rem] items-center gap-3">
      <audio
        ref={audioRef}
        src={src ?? undefined}
        preload="metadata"
        playsInline
        onTimeUpdate={onTimeUpdate}
        onLoadedMetadata={() => {
          const audio = audioRef.current;
          if (audio?.duration && Number.isFinite(audio.duration)) {
            setLoadedDuration(audio.duration);
          }
        }}
        onCanPlay={() => {
          setFailed(false);
          setLoading(false);
        }}
        onWaiting={() => setLoading(true)}
        onError={() => {
          setLoading(false);
          // The blob fallback is attempted on the next tap.
          if (playing) setPlaying(false);
        }}
        onEnded={() => {
          setPlaying(false);
          setProgress(0);
          setElapsed(0);
          if (audioRef.current) audioRef.current.currentTime = 0;
        }}
      />
      <button
        type="button"
        onClick={() => void toggle()}
        disabled={!src || failed}
        className={cn(
          'flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition disabled:opacity-40',
          isMine
            ? 'bg-ink-950/90 text-neon'
            : 'bg-white/10 text-white hover:bg-white/15',
        )}
        aria-label={
          failed
            ? 'Voice note unavailable'
            : loading
              ? 'Loading voice message'
              : playing
                ? 'Pause voice message'
                : 'Play voice message'
        }
      >
        {failed ? (
          <AlertTriangle className="h-3.5 w-3.5" />
        ) : loading ? (
          <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" />
        ) : playing ? (
          <Pause className="h-3.5 w-3.5 fill-current" />
        ) : (
          <Play className="ml-0.5 h-3.5 w-3.5 fill-current" />
        )}
      </button>
      <div className="flex flex-1 flex-col gap-1.5">
        <div className="flex h-7 items-center gap-[0.125rem]">
          {WAVE.map((height, index) => {
            const active = index / WAVE.length <= progress;
            return (
              <span
                key={index}
                className={cn(
                  'w-[0.125rem] rounded-full transition-colors',
                  isMine
                    ? active
                      ? 'bg-ink-950'
                      : 'bg-ink-950/30'
                    : active
                      ? 'bg-neon'
                      : 'bg-white/25',
                )}
                style={{ height: `${height}px` }}
              />
            );
          })}
        </div>
        <span
          className={cn(
            'text-[0.625rem]',
            failed
              ? isMine
                ? 'text-ink-950/80'
                : 'text-rose/80'
              : isMine
                ? 'text-ink-950/70'
                : 'text-white/50',
          )}
        >
          {failed ? 'Voice note unavailable' : shown}
        </span>
      </div>
    </div>
  );
}
