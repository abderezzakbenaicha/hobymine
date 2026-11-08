/**
 * Shared MediaRecorder helpers.
 *
 * Chat voice notes and the profile voice introduction both record audio in the
 * WebView, and Android picks a different container on different devices. Keeping
 * the negotiation in one place means both features accept whatever the device
 * supports and the server still receives a plain `audio/*` MIME type.
 */

/** Containers the browser may be able to record, best first. */
const RECORDER_MIME_TYPES = [
  'audio/webm;codecs=opus',
  'audio/webm',
  'audio/ogg;codecs=opus',
  'audio/ogg',
  'audio/mp4',
  'audio/mpeg',
];

const VOICE_EXTENSIONS: Record<string, string> = {
  'audio/webm': 'webm',
  'audio/ogg': 'ogg',
  'audio/mp4': 'm4a',
  'audio/mpeg': 'mp3',
  'audio/wav': 'wav',
};

export function isRecordingSupported(): boolean {
  return typeof MediaRecorder !== 'undefined' && Boolean(navigator.mediaDevices?.getUserMedia);
}

/** The first container this browser can record, or an empty string. */
export function pickRecorderMimeType(): string {
  if (typeof MediaRecorder === 'undefined') return '';
  return (
    RECORDER_MIME_TYPES.find((type) => {
      try {
        return MediaRecorder.isTypeSupported(type);
      } catch {
        return false;
      }
    }) ?? ''
  );
}

/**
 * Normalises what MediaRecorder reports into a MIME type the API accepts.
 * Android's WebView falls back to `video/webm` when no audio container is
 * advertised, so anything non-audio becomes `audio/webm`.
 */
export function normalizeRecordingType(recorded: string): string {
  const base = recorded.split(';')[0]?.trim().toLowerCase() ?? '';
  return base.startsWith('audio/') ? base : 'audio/webm';
}

export function voiceExtensionFor(mime: string): string {
  return VOICE_EXTENSIONS[mime] ?? 'webm';
}

/** A File the upload endpoint will accept, named with the right extension. */
export function recordingFile(blob: Blob, mime: string): File {
  const extension = voiceExtensionFor(mime);
  return new File([blob], `voice-${Date.now()}.${extension}`, { type: mime });
}
