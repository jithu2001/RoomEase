/**
 * ID photo compression.
 *
 * Every captured or picked image is resized to ~800x600, re-encoded as JPEG at
 * 50–60% quality and only then written to disk. Re-encoding through a canvas
 * also drops EXIF/GPS metadata, which matters because these are ID documents.
 *
 * The geometry and validation helpers at the top are pure and unit tested; the
 * canvas-backed `compressImage` needs a DOM and is exercised manually / in the
 * browser.
 */

import { AppError } from './errors';
import { base64ByteLength, base64ToBytes } from './base64';
import type { PreparedImage } from '../types';

export interface CompressOptions {
  maxWidth?: number;
  maxHeight?: number;
  /** Starting JPEG quality (0–1). */
  quality?: number;
  /** Retry at lower quality until the result fits, when possible. */
  maxBytes?: number;
  minQuality?: number;
  thumbMaxWidth?: number;
  thumbQuality?: number;
}

export const DEFAULT_COMPRESS_OPTIONS = {
  maxWidth: 800,
  maxHeight: 600,
  quality: 0.6,
  maxBytes: 150 * 1024,
  minQuality: 0.4,
  thumbMaxWidth: 240,
  thumbQuality: 0.5,
} as const satisfies Required<CompressOptions>;

export const ALLOWED_IMAGE_MIME = [
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
  'image/heic',
  'image/heif',
] as const;

export interface Size {
  width: number;
  height: number;
}

/**
 * Fits `source` inside `maxWidth` x `maxHeight` keeping the aspect ratio.
 * Never upscales — a 320x240 photo stays 320x240.
 */
export function computeTargetSize(source: Size, maxWidth: number, maxHeight: number): Size {
  const { width, height } = source;
  if (!(width > 0) || !(height > 0)) {
    throw new AppError('INVALID_IMAGE', 'The selected image has no readable dimensions.');
  }
  const scale = Math.min(1, maxWidth / width, maxHeight / height);
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

export function isSupportedImageMime(mime: string | null | undefined): boolean {
  if (!mime) return false;
  return (ALLOWED_IMAGE_MIME as readonly string[]).includes(mime.toLowerCase());
}

/** Reads the mime type out of a `data:` URL, or null when absent/invalid. */
export function mimeFromDataUrl(dataUrl: string): string | null {
  const match = /^data:([^;,]+)[;,]/.exec(dataUrl);
  return match ? match[1].toLowerCase() : null;
}

/** Validates a file chosen from the gallery before any decoding is attempted. */
export function assertValidImageFile(file: { type?: string; name?: string; size?: number }): void {
  const byExtension = /\.(jpe?g|png|webp|heic|heif)$/i.test(file.name ?? '');
  if (!isSupportedImageMime(file.type) && !byExtension) {
    throw new AppError('INVALID_IMAGE', 'That file is not a supported image (JPG, PNG or WEBP).');
  }
  if (file.size !== undefined && file.size <= 0) {
    throw new AppError('INVALID_IMAGE', 'That image file is empty.');
  }
  if (file.size !== undefined && file.size > 40 * 1024 * 1024) {
    throw new AppError('INVALID_IMAGE', 'That image is too large to process (over 40 MB).');
  }
}

export function assertValidImageDataUrl(dataUrl: string): void {
  if (!dataUrl.startsWith('data:')) {
    throw new AppError('INVALID_IMAGE', 'The captured photo could not be read.');
  }
  const mime = mimeFromDataUrl(dataUrl);
  if (!isSupportedImageMime(mime)) {
    throw new AppError('INVALID_IMAGE', 'The captured photo is not a supported image format.');
  }
  if (base64ByteLength(dataUrl) < 100) {
    throw new AppError('INVALID_IMAGE', 'The captured photo appears to be empty.');
  }
}

/** Human readable size for previews: `92 KB`. */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/* ------------------------------------------------------------------ */
/* DOM-backed pipeline                                                 */
/* ------------------------------------------------------------------ */

function loadImageElement(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () =>
      reject(
        new AppError('INVALID_IMAGE', 'This image could not be opened. Please try another photo.'),
      );
    img.decoding = 'sync';
    img.src = src;
  });
}

function drawJpeg(img: HTMLImageElement, size: Size, quality: number): string {
  const canvas = document.createElement('canvas');
  canvas.width = size.width;
  canvas.height = size.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new AppError('IMAGE_COMPRESSION', 'This device could not process the photo.');
  }
  // White backdrop so transparent PNGs do not turn black in JPEG.
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, size.width, size.height);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, 0, 0, size.width, size.height);
  const dataUrl = canvas.toDataURL('image/jpeg', quality);
  // Free the backing store early — Android WebViews are memory tight.
  canvas.width = 0;
  canvas.height = 0;
  if (!dataUrl.startsWith('data:image/jpeg')) {
    throw new AppError('IMAGE_COMPRESSION', 'The photo could not be converted to JPEG.');
  }
  return dataUrl;
}

/**
 * Resizes + compresses an image and produces both the stored JPEG and a small
 * thumbnail. `source` may be a data URL, an object URL, a Blob or a File.
 */
export async function compressImage(
  source: string | Blob,
  options: CompressOptions = {},
): Promise<PreparedImage> {
  const opts = { ...DEFAULT_COMPRESS_OPTIONS, ...options };

  let src: string;
  let revoke: string | null = null;
  if (typeof source === 'string') {
    if (source.startsWith('data:')) assertValidImageDataUrl(source);
    src = source;
  } else {
    assertValidImageFile({ type: source.type, size: source.size });
    src = URL.createObjectURL(source);
    revoke = src;
  }

  try {
    const img = await loadImageElement(src);
    const natural = { width: img.naturalWidth, height: img.naturalHeight };
    const size = computeTargetSize(natural, opts.maxWidth, opts.maxHeight);

    let quality = opts.quality;
    let dataUrl = drawJpeg(img, size, quality);
    // Step down quality (never below minQuality) until the target size is met.
    while (base64ByteLength(dataUrl) > opts.maxBytes && quality > opts.minQuality) {
      quality = Math.max(opts.minQuality, Math.round((quality - 0.05) * 100) / 100);
      dataUrl = drawJpeg(img, size, quality);
    }

    const thumbSize = computeTargetSize(size, opts.thumbMaxWidth, opts.thumbMaxWidth);
    const thumbDataUrl = drawJpeg(img, thumbSize, opts.thumbQuality);

    const full = base64ToBytes(dataUrl);
    if (full.length === 0) {
      throw new AppError('IMAGE_COMPRESSION', 'The compressed photo was empty. Please retake it.');
    }

    return {
      full,
      thumb: base64ToBytes(thumbDataUrl),
      previewDataUrl: dataUrl,
      width: size.width,
      height: size.height,
      bytes: full.length,
    };
  } catch (e) {
    if (e instanceof AppError) throw e;
    throw new AppError('IMAGE_COMPRESSION', 'The photo could not be compressed.', e);
  } finally {
    if (revoke) URL.revokeObjectURL(revoke);
  }
}
