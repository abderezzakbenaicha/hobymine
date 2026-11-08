/**
 * Image preparation for uploads.
 *
 * Android galleries hand over HEIC/HEIF files that many browsers cannot
 * decode, and the server only stores the formats every browser can show.
 * The picture is therefore re-encoded as a JPEG in the browser before it is
 * uploaded: smaller payloads, instant display, no "broken image" icons.
 */
const MAX_DIMENSION = 1600;
const JPEG_QUALITY = 0.85;

export interface PreparedImage {
  file: File;
  /** A local preview URL, when the picture could be decoded. */
  previewUrl: string | null;
  /** True when the file was re-encoded. */
  converted: boolean;
}

function loadBitmap(file: File): Promise<ImageBitmap | HTMLImageElement | null> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const cleanup = (): void => URL.revokeObjectURL(url);

    const useImageFallback = (): void => {
      const image = new Image();
      image.onload = () => {
        cleanup();
        resolve(image);
      };
      image.onerror = () => {
        cleanup();
        resolve(null);
      };
      image.src = url;
    };

    if (typeof createImageBitmap === 'function') {
      createImageBitmap(file)
        .then((bitmap) => {
          cleanup();
          resolve(bitmap);
        })
        .catch(() => {
          // Fall back to an <img> element for formats the decoder rejects.
          useImageFallback();
        });
      return;
    }

    useImageFallback();
  });
}

function sizeOf(bitmap: ImageBitmap | HTMLImageElement): { width: number; height: number } {
  const width = 'naturalWidth' in bitmap ? bitmap.naturalWidth : bitmap.width;
  const height = 'naturalHeight' in bitmap ? bitmap.naturalHeight : bitmap.height;
  return { width: width || 0, height: height || 0 };
}

/**
 * Re-encodes an image as JPEG when possible. The original file is returned
 * untouched when the browser cannot decode it, so the upload still goes
 * through.
 */
export async function prepareImageForUpload(file: File): Promise<PreparedImage> {
  if (!file.type.startsWith('image/')) {
    return { file, previewUrl: null, converted: false };
  }

  const bitmap = await loadBitmap(file);
  if (!bitmap) {
    return { file, previewUrl: null, converted: false };
  }

  const { width, height } = sizeOf(bitmap);
  if (!width || !height) {
    return { file, previewUrl: null, converted: false };
  }

  const scale = Math.min(1, MAX_DIMENSION / Math.max(width, height));
  const targetWidth = Math.max(1, Math.round(width * scale));
  const targetHeight = Math.max(1, Math.round(height * scale));

  try {
    const canvas = document.createElement('canvas');
    canvas.width = targetWidth;
    canvas.height = targetHeight;
    const context = canvas.getContext('2d');
    if (!context) return { file, previewUrl: null, converted: false };
    context.drawImage(bitmap as CanvasImageSource, 0, 0, targetWidth, targetHeight);

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, 'image/jpeg', JPEG_QUALITY),
    );
    if (!blob) return { file, previewUrl: null, converted: false };

    const name = file.name.replace(/\.[^.]+$/, '') || 'photo';
    const converted = new File([blob], `${name}.jpg`, {
      type: 'image/jpeg',
      lastModified: Date.now(),
    });
    return {
      file: converted,
      previewUrl: URL.createObjectURL(converted),
      converted: true,
    };
  } catch {
    return { file, previewUrl: null, converted: false };
  } finally {
    if ('close' in bitmap && typeof bitmap.close === 'function') bitmap.close();
  }
}
