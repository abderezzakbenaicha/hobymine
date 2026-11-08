import {
  Loader2,
  Mic,
  Pause,
  Play,
  RotateCcw,
  Square,
  Trash2,
  Upload,
  Volume2,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react';
import { toast } from 'sonner';
import { api, ApiClientError } from '../lib/api';
import { mediaUrl } from '../lib/media';
import { ensureMicrophone } from '../lib/permissions';
import {
  isRecordingSupported,
  normalizeRecordingType,
  pickRecorderMimeType,
  recordingFile,
} from '../lib/recorder';
import { cn } from '../lib/utils';
import type { MeUser, VoiceIntro } from '../types';

/** The product rule: a self-introduction never runs longer than this. */
export const MAX_VOICE_INTRO_SECONDS = 20;

function secondsLabel(value: number): string {
  const total = Math.max(0, Math.round(value));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

/** Reads a clip's length without mounting it, for the upload path. */
function readAudioDuration(src: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const audio = document.createElement('audio');
    audio.preload = 'metadata';
    const cleanup = (): void => {
      audio.onloadedmetadata = null;
      audio.onerror = null;
      audio.removeAttribute('src');
    };
    audio.onloadedmetadata = () => {
      const value = audio.duration;
      cleanup();
      resolve(value);
    };
    audio.onerror = () => {
      cleanup();
      reject(new Error('Unreadable audio file'));
    };
    audio.src = src;
  });
}

/** Picks a MIME type for an uploaded clip, falling back to the extension. */
function mimeForAudioFile(file: File): string {
  const reported = (file.type || '').toLowerCase();
  if (reported.startsWith('audio/')) return normalizeRecordingType(reported);
  const extension = file.name.split('.').pop()?.toLowerCase() ?? '';
  const byExtension: Record<string, string> = {
    mp3: 'audio/mpeg',
    m4a: 'audio/mp4',
    aac: 'audio/mp4',
    wav: 'audio/wav',
    oga: 'audio/ogg',
    ogg: 'audio/ogg',
    opus: 'audio/ogg',
    webm: 'audio/webm',
  };
  return byExtension[extension] ?? 'audio/webm';
}

/**
 * Deterministic waveform bars so the same clip always looks the same without
 * decoding the audio. It is decoration: the progress is what carries meaning.
 */
function useWaveform(seed: string, bars = 32): number[] {
  return useMemo(() => {
    let hash = 0;
    for (const character of seed) {
      hash = (hash * 31 + character.charCodeAt(0)) % 100_000;
    }
    return Array.from({ length: bars }, (_, index) => {
      const wave = Math.sin((index + (hash % 11)) * 0.68) * 0.5 + 0.5;
      const jitter = ((hash >> (index % 12)) % 7) / 20;
      return 0.28 + wave * 0.55 + jitter;
    });
  }, [seed, bars]);
}

/* -------------------------------------------------------------------------- */
/*  Player                                                                     */
/* -------------------------------------------------------------------------- */

interface VoiceIntroPlayerProps {
  intro: VoiceIntro | null | undefined;
  /** Name of the person speaking, used in the accessible label. */
  name: string;
  /** `full` is the panel in the profile view, `compact` fits in a list row. */
  variant?: 'full' | 'compact';
  className?: string;
}

export function VoiceIntroPlayer({
  intro,
  name,
  variant = 'full',
  className,
}: VoiceIntroPlayerProps) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [position, setPosition] = useState(0);
  const [duration, setDuration] = useState(intro?.duration ?? 0);
  const [failed, setFailed] = useState(false);

  const src = mediaUrl(intro?.url);
  const bars = useWaveform(intro?.url ?? 'voice');

  useEffect(() => {
    setPlaying(false);
    setPosition(0);
    setDuration(intro?.duration ?? 0);
    setFailed(false);
  }, [intro?.url, intro?.duration]);

  if (!intro || !src) return null;

  const total = duration > 0 ? duration : MAX_VOICE_INTRO_SECONDS;
  const progress = Math.min(1, total > 0 ? position / total : 0);

  const toggle = (): void => {
    const audio = audioRef.current;
    if (!audio) return;
    if (playing) {
      audio.pause();
      return;
    }
    void audio.play().catch(() => setFailed(true));
  };

  const seek = (event: React.MouseEvent<HTMLButtonElement>): void => {
    const audio = audioRef.current;
    if (!audio) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const ratio = Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width));
    audio.currentTime = ratio * total;
    setPosition(audio.currentTime);
  };

  const compact = variant === 'compact';

  return (
    <div
      className={cn(
        'flex items-center gap-3 rounded-2xl border border-white/[0.08] bg-white/[0.03]',
        compact ? 'px-2.5 py-2' : 'p-3.5',
        className,
      )}
    >
      <audio
        ref={audioRef}
        src={src}
        preload="metadata"
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => {
          setPlaying(false);
          setPosition(0);
        }}
        onTimeUpdate={(event) => setPosition(event.currentTarget.currentTime)}
        onLoadedMetadata={(event) => {
          const value = event.currentTarget.duration;
          if (Number.isFinite(value) && value > 0) setDuration(Math.min(value, MAX_VOICE_INTRO_SECONDS));
        }}
        onError={() => setFailed(true)}
      />

      <button
        type="button"
        onClick={toggle}
        disabled={failed}
        className={cn(
          'flex shrink-0 items-center justify-center rounded-full bg-neon-gradient text-ink-950 shadow-glow-sm transition hover:brightness-105 active:scale-95 disabled:opacity-40',
          compact ? 'h-8 w-8' : 'h-11 w-11',
        )}
        aria-label={
          failed
            ? `${name}'s voice introduction is unavailable`
            : playing
              ? `Pause ${name}'s voice introduction`
              : `Play ${name}'s voice introduction`
        }
      >
        {failed ? (
          <Volume2 className={compact ? 'h-3.5 w-3.5' : 'h-4 w-4'} />
        ) : playing ? (
          <Pause className={compact ? 'h-3.5 w-3.5' : 'h-4 w-4'} />
        ) : (
          <Play className={cn('fill-ink-950', compact ? 'h-3.5 w-3.5' : 'h-4 w-4')} />
        )}
      </button>

      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-2">
          <p
            className={cn(
              'truncate font-semibold text-white',
              compact ? 'text-[0.625rem]' : 'text-[0.6875rem]',
            )}
          >
            {failed ? 'Voice introduction unavailable' : `${name.split(' ')[0]}'s voice intro`}
          </p>
          <span
            className={cn(
              'shrink-0 tabular-nums text-ink-400',
              compact ? 'text-[0.5625rem]' : 'text-[0.625rem]',
            )}
          >
            {secondsLabel(position)} / {secondsLabel(total)}
          </span>
        </div>

        <button
          type="button"
          onClick={seek}
          disabled={failed}
          className={cn('mt-1.5 flex w-full items-end gap-[2px]', compact ? 'h-4' : 'h-6')}
          aria-label={`Seek within ${name}'s voice introduction`}
        >
          {bars.map((height, index) => {
            const filled = index / bars.length <= progress;
            return (
              <span
                key={index}
                className={cn(
                  'flex-1 rounded-full transition-colors',
                  filled ? 'bg-neon' : 'bg-white/15',
                )}
                style={{ height: `${Math.round(height * 100)}%` }}
              />
            );
          })}
        </button>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Recorder (profile editor)                                                  */
/* -------------------------------------------------------------------------- */

interface VoiceIntroRecorderProps {
  intro: VoiceIntro | null;
  onChange: (user: MeUser) => void;
  className?: string;
}

export function VoiceIntroRecorder({ intro, onChange, className }: VoiceIntroRecorderProps) {
  const [mode, setMode] = useState<'idle' | 'recording' | 'preview'>('idle');
  const [seconds, setSeconds] = useState(0);
  const [saving, setSaving] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewSeconds, setPreviewSeconds] = useState(0);
  const [previewing, setPreviewing] = useState(false);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const blobRef = useRef<Blob | null>(null);
  const mimeRef = useRef('audio/webm');
  const secondsRef = useRef(0);
  const timerRef = useRef<number | null>(null);
  const cancelledRef = useRef(false);
  const previewAudioRef = useRef<HTMLAudioElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const clearTimer = (): void => {
    if (timerRef.current) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
  };

  const releaseStream = (): void => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
  };

  const dropPreview = useCallback((): void => {
    setPreviewUrl((current) => {
      if (current) URL.revokeObjectURL(current);
      return null;
    });
    setPreviewSeconds(0);
    setPreviewing(false);
    blobRef.current = null;
  }, []);

  useEffect(() => {
    return () => {
      clearTimer();
      cancelledRef.current = true;
      releaseStream();
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
    // The preview URL is revoked by dropPreview on every explicit reset.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const startRecording = async (): Promise<void> => {
    if (!isRecordingSupported()) {
      toast.error('Voice recording is not supported on this device');
      return;
    }
    const permission = await ensureMicrophone();
    if (!permission.granted) {
      if (permission.reason === 'unavailable') {
        toast.error('No microphone available on this device');
      } else {
        toast.error('Microphone access is needed for your voice intro', {
          description: 'Enable the microphone permission in Android settings and try again.',
        });
      }
      return;
    }

    try {
      dropPreview();
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const mimeType = pickRecorderMimeType();
      const recorder = mimeType
        ? new MediaRecorder(stream, { mimeType })
        : new MediaRecorder(stream);
      recorderRef.current = recorder;
      chunksRef.current = [];
      cancelledRef.current = false;

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunksRef.current.push(event.data);
      };

      recorder.onstop = () => {
        clearTimer();
        releaseStream();
        setMode('idle');
        const recordedSeconds = Math.max(1, Math.round(secondsRef.current));
        setSeconds(0);
        secondsRef.current = 0;
        if (cancelledRef.current) return;
        const mime = normalizeRecordingType(recorder.mimeType || mimeType || '');
        const blob = new Blob(chunksRef.current, { type: mime });
        if (blob.size === 0) {
          toast.error('Nothing was recorded');
          return;
        }
        mimeRef.current = mime;
        blobRef.current = blob;
        setPreviewUrl(URL.createObjectURL(blob));
        setPreviewSeconds(Math.min(recordedSeconds, MAX_VOICE_INTRO_SECONDS));
        setMode('preview');
      };

      recorder.start();
      setMode('recording');
      setSeconds(0);
      secondsRef.current = 0;
      timerRef.current = window.setInterval(() => {
        secondsRef.current += 1;
        setSeconds(secondsRef.current);
        if (secondsRef.current >= MAX_VOICE_INTRO_SECONDS) recorder.stop();
      }, 1000);
    } catch {
      releaseStream();
      toast.error('Microphone permission was denied');
    }
  };

  const stopRecording = (cancel: boolean): void => {
    cancelledRef.current = cancel;
    recorderRef.current?.stop();
  };

  /**
   * Uploads an existing clip instead of recording. The file is only linked to
   * the profile after its real length has been checked, so the 20-second rule
   * holds for uploads too.
   */
  const uploadAudio = async (event: ChangeEvent<HTMLInputElement>): Promise<void> => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;

    if (file.type && !file.type.toLowerCase().startsWith('audio/')) {
      toast.error('Choose an audio file', { description: 'MP3, M4A, WAV, OGG or WebM.' });
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      toast.error('That clip is too large', { description: 'Keep it under 10 MB.' });
      return;
    }

    const url = URL.createObjectURL(file);
    try {
      const seconds = await readAudioDuration(url);
      if (!Number.isFinite(seconds) || seconds <= 0) throw new Error('No duration');
      if (seconds > MAX_VOICE_INTRO_SECONDS + 0.5) {
        toast.error(`Keep your intro under ${MAX_VOICE_INTRO_SECONDS} seconds`, {
          description: `That clip is ${Math.ceil(seconds)} seconds long.`,
        });
        URL.revokeObjectURL(url);
        return;
      }
      dropPreview();
      blobRef.current = file;
      mimeRef.current = mimeForAudioFile(file);
      setPreviewUrl(url);
      setPreviewSeconds(Math.max(1, Math.min(MAX_VOICE_INTRO_SECONDS, Math.round(seconds))));
      setMode('preview');
    } catch {
      URL.revokeObjectURL(url);
      toast.error('Could not read that audio file', {
        description: 'Try a different clip or record one instead.',
      });
    }
  };

  const saveRecording = async (): Promise<void> => {
    const blob = blobRef.current;
    if (!blob) return;
    setSaving(true);
    try {
      const file = recordingFile(blob, mimeRef.current);
      const form = new FormData();
      form.append('file', file);
      const uploaded = await api.upload<{ url: string }>('/api/uploads', form);
      const data = await api.put<{ user: MeUser }>('/api/me/voice-intro', {
        url: uploaded.url,
        duration: Math.min(MAX_VOICE_INTRO_SECONDS, Math.max(1, previewSeconds)),
      });
      onChange(data.user);
      dropPreview();
      toast.success('Voice intro saved');
    } catch (error) {
      toast.error(
        error instanceof ApiClientError ? error.message : 'Could not save your voice intro',
      );
    } finally {
      setSaving(false);
    }
  };

  const removeRecording = async (): Promise<void> => {
    setRemoving(true);
    try {
      const data = await api.delete<{ user: MeUser }>('/api/me/voice-intro');
      onChange(data.user);
      dropPreview();
      toast.success('Voice intro removed');
    } catch (error) {
      toast.error(
        error instanceof ApiClientError ? error.message : 'Could not remove your voice intro',
      );
    } finally {
      setRemoving(false);
    }
  };

  const togglePreview = (): void => {
    const audio = previewAudioRef.current;
    if (!audio) return;
    if (previewing) {
      audio.pause();
      return;
    }
    void audio.play().catch(() => toast.error('Could not play that recording'));
  };

  const remaining = Math.max(0, MAX_VOICE_INTRO_SECONDS - seconds);

  return (
    <div className={cn('rounded-2xl border border-white/[0.08] bg-white/[0.02] p-4', className)}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="flex items-center gap-1.5 text-[0.6875rem] font-semibold text-white">
            <Mic className="h-3.5 w-3.5 text-neon" />
            Voice introduction
          </p>
          <p className="mt-1 text-[0.625rem] leading-relaxed text-ink-400">
            Up to {MAX_VOICE_INTRO_SECONDS} seconds. Record a hello or upload a short clip — say
            what you are into, or what a good Saturday looks like.
          </p>
        </div>
        <span className="shrink-0 rounded-full border border-white/10 px-2 py-0.5 text-[0.5625rem] font-bold uppercase tracking-[0.12em] text-ink-400">
          {MAX_VOICE_INTRO_SECONDS}s max
        </span>
      </div>

      {mode === 'recording' ? (
        <div className="mt-4 flex items-center gap-3 rounded-xl border border-rose/30 bg-rose/[0.08] px-3 py-3">
          <span className="relative flex h-2.5 w-2.5 shrink-0">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-rose opacity-70" />
            <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-rose" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[0.6875rem] font-semibold text-white">
              Recording · {secondsLabel(seconds)}
            </p>
            <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-white/10">
              <div
                className="h-full rounded-full bg-rose transition-[width] duration-500"
                style={{ width: `${(seconds / MAX_VOICE_INTRO_SECONDS) * 100}%` }}
              />
            </div>
            <p className="mt-1 text-[0.5625rem] text-ink-400">
              Stops automatically at {MAX_VOICE_INTRO_SECONDS}s · {remaining}s left
            </p>
          </div>
          <button
            type="button"
            onClick={() => stopRecording(true)}
            className="shrink-0 rounded-full border border-white/10 bg-white/5 p-2 text-ink-300 transition hover:text-white"
            aria-label="Discard recording"
            title="Discard"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={() => stopRecording(false)}
            className="flex shrink-0 items-center gap-1.5 rounded-full bg-neon px-3 py-2 text-[0.625rem] font-bold text-ink-950 transition hover:brightness-105"
          >
            <Square className="h-3 w-3 fill-ink-950" />
            Stop
          </button>
        </div>
      ) : null}

      {mode === 'preview' && previewUrl ? (
        <div className="mt-4 rounded-xl border border-neon/25 bg-neon/[0.06] p-3">
          <audio
            ref={previewAudioRef}
            src={previewUrl}
            preload="metadata"
            onPlay={() => setPreviewing(true)}
            onPause={() => setPreviewing(false)}
            onEnded={() => setPreviewing(false)}
          />
          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={togglePreview}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-neon text-ink-950"
              aria-label={previewing ? 'Pause preview' : 'Play preview'}
            >
              {previewing ? (
                <Pause className="h-3.5 w-3.5" />
              ) : (
                <Play className="h-3.5 w-3.5 fill-ink-950" />
              )}
            </button>
            <div className="min-w-0 flex-1">
              <p className="text-[0.6875rem] font-semibold text-white">Preview ready</p>
              <p className="text-[0.5625rem] text-ink-400">
                {secondsLabel(previewSeconds)} · not saved yet
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                dropPreview();
                void startRecording();
              }}
              disabled={saving}
              className="shrink-0 rounded-full border border-white/10 bg-white/5 p-2 text-ink-300 transition hover:text-white disabled:opacity-40"
              aria-label="Record again"
              title="Record again"
            >
              <RotateCcw className="h-3.5 w-3.5" />
            </button>
          </div>
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              onClick={() => void saveRecording()}
              disabled={saving}
              className="btn-primary flex-1 py-2 text-[0.6875rem]"
            >
              {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Mic className="h-3.5 w-3.5" />}
              {saving ? 'Saving…' : 'Use this recording'}
            </button>
            <button
              type="button"
              onClick={dropPreview}
              disabled={saving}
              className="btn-ghost px-3 py-2 text-[0.6875rem]"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : null}

      {mode === 'idle' ? (
        <div className="mt-4 space-y-3">
          <input
            ref={fileInputRef}
            type="file"
            accept="audio/*"
            className="hidden"
            onChange={(event) => void uploadAudio(event)}
          />
          {intro ? (
            <>
              <VoiceIntroPlayer intro={intro} name="You" variant="compact" />
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => void startRecording()}
                  className="btn-ghost flex-1 py-2 text-[0.6875rem]"
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                  Record a new one
                </button>
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="btn-ghost flex-1 py-2 text-[0.6875rem]"
                >
                  <Upload className="h-3.5 w-3.5" />
                  Upload audio
                </button>
                <button
                  type="button"
                  onClick={() => void removeRecording()}
                  disabled={removing}
                  className="flex items-center justify-center gap-1.5 rounded-xl border border-rose/25 bg-rose/[0.06] px-3 py-2 text-[0.6875rem] font-semibold text-rose transition hover:bg-rose/10 disabled:opacity-40"
                >
                  {removing ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Trash2 className="h-3.5 w-3.5" />
                  )}
                  Remove
                </button>
              </div>
            </>
          ) : (
            <div className="grid gap-2 sm:grid-cols-2">
              <button
                type="button"
                onClick={() => void startRecording()}
                className="btn-primary py-2.5 text-[0.6875rem]"
              >
                <Mic className="h-3.5 w-3.5" />
                Record your intro
              </button>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="btn-ghost py-2.5 text-[0.6875rem]"
              >
                <Upload className="h-3.5 w-3.5" />
                Upload audio
              </button>
            </div>
          )}
          <p className="text-center text-[0.5625rem] text-ink-500">
            MP3, M4A, WAV, OGG or WebM · 20 seconds max
          </p>
        </div>
      ) : null}
    </div>
  );
}
