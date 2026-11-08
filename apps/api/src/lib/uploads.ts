import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import multer from 'multer';

const here = path.dirname(fileURLToPath(import.meta.url));

/**
 * Uploads always live next to the API package, never next to the process that
 * happens to be running it. Resolving from `process.cwd()` broke the app as
 * soon as the server was started from the repository root: the files were
 * written to `<root>/uploads` while the static route served
 * `apps/api/uploads`, so every photo and voice note 404'd.
 */
export const uploadsDir = path.resolve(here, '..', '..', 'uploads');

if (!existsSync(uploadsDir)) {
  mkdirSync(uploadsDir, { recursive: true });
}

export const MIME_EXTENSIONS: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/jpg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'image/gif': '.gif',
  'image/bmp': '.bmp',
  'image/avif': '.avif',
  'image/heic': '.heic',
  'image/heif': '.heif',
  'audio/webm': '.webm',
  'audio/ogg': '.ogg',
  'audio/mpeg': '.mp3',
  'audio/wav': '.wav',
  'audio/x-wav': '.wav',
  'audio/mp4': '.m4a',
  'audio/x-m4a': '.m4a',
  // Documents that can be shared in chat. The extension is chosen from the
  // reported MIME type so the stored file keeps the right icon in the app.
  'application/pdf': '.pdf',
  'text/plain': '.txt',
  'text/csv': '.csv',
  'text/rtf': '.rtf',
  'application/rtf': '.rtf',
  'application/json': '.json',
  'application/msword': '.doc',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': '.docx',
  'application/vnd.ms-excel': '.xls',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': '.xlsx',
  'application/vnd.ms-powerpoint': '.ppt',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': '.pptx',
  'application/vnd.oasis.opendocument.text': '.odt',
  'application/vnd.oasis.opendocument.spreadsheet': '.ods',
  'application/zip': '.zip',
  'application/x-zip-compressed': '.zip',
  'application/x-rar-compressed': '.rar',
  'application/vnd.rar': '.rar',
  'application/x-7z-compressed': '.7z',
};

/** Extensions the chat composer offers in its document picker. */
export const DOCUMENT_ACCEPT =
  '.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.odt,.ods,.txt,.csv,.rtf,.json,.zip,.rar,.7z';

/**
 * Multer receives non-ASCII filenames as latin-1. Convert them back to UTF-8
 * so a document called "résumé.pdf" keeps its name in the chat bubble.
 */
export function decodeOriginalName(name: string): string {
  try {
    return Buffer.from(name, 'latin1').toString('utf8');
  } catch {
    return name;
  }
}

/** A safe, short display name for an uploaded document. */
export function displayFileName(originalName: string, mime: string): string {
  const decoded = decodeOriginalName(originalName || '').replace(/[\u0000-\u001f<>:"/\\|?*]/g, '').trim();
  if (decoded) return decoded.slice(0, 180);
  const extension = MIME_EXTENSIONS[normalizeMimeType(mime)] ?? '';
  return `attachment${extension}`;
}

/**
 * Strips parameters such as `;codecs=opus` and lower-cases the type, so a
 * recording reported as `audio/webm;codecs=opus` is stored like a plain
 * `audio/webm`.
 */
export function normalizeMimeType(mime: string): string {
  return mime.split(';')[0]!.trim().toLowerCase();
}

export function mimeKind(mime: string): 'image' | 'voice' | 'file' | null {
  const type = normalizeMimeType(mime);
  if (type.startsWith('image/')) return 'image';
  if (type.startsWith('audio/')) return 'voice';
  if (MIME_EXTENSIONS[type]) return 'file';
  return null;
}

const storage = multer.diskStorage({
  destination: uploadsDir,
  filename: (_req, file, callback) => {
    const extension = MIME_EXTENSIONS[normalizeMimeType(file.mimetype)] ?? '';
    callback(null, `${randomUUID()}${extension}`);
  },
});

export const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, callback) => {
    if (!MIME_EXTENSIONS[normalizeMimeType(file.mimetype)]) {
      callback(new Error('UNSUPPORTED_FILE_TYPE'));
      return;
    }
    callback(null, true);
  },
});

/** The stored file extension for a MIME type, or an empty string. */
export function extensionForMime(mime: string): string {
  return MIME_EXTENSIONS[normalizeMimeType(mime)] ?? '';
}
