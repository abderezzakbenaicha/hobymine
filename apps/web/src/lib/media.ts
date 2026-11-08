import { getApiBase } from './apiConfig';

/**
 * Resolves a media path coming from the API.
 *
 * Uploaded files are stored on the server and returned as `/uploads/...`.
 * In the packaged Android app the page is served from `https://localhost`,
 * so those paths have to be prefixed with the API host. Seed artwork and the
 * bundled sounds are part of the app and stay relative.
 */
export function mediaUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  if (/^(https?:)?\/\//i.test(url) || url.startsWith('data:')) return url;
  if (url.startsWith('/uploads/')) {
    const base = getApiBase();
    return base ? `${base}${url}` : url;
  }
  return url;
}
