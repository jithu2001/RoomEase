/**
 * ID photo capture + storage.
 *
 * Flow: capture → compress (utils/imageCompression) → write two JPEGs into
 * private storage → hand the *paths* back so only paths reach SQLite.
 */

import { Camera, CameraResultType, CameraSource } from '@capacitor/camera';
import { Capacitor } from '@capacitor/core';
import { AppError, logError } from '../utils/errors';
import {
  assertValidImageFile,
  compressImage,
  type CompressOptions,
} from '../utils/imageCompression';
import { customerDir, guestDir, type FileStore } from './fileStore';
import type { PreparedImage } from '../types';

export type CaptureSource = 'camera' | 'gallery';
export type IdSide = 'front' | 'back';

export interface StoredIdImage {
  path: string;
  thumbPath: string;
  bytes: number;
}

export function idImageNames(side: IdSide): { full: string; thumb: string } {
  return { full: `id-${side}.jpg`, thumb: `id-${side}-thumb.jpg` };
}

/* ------------------------------------------------------------------ */
/* Capture                                                             */
/* ------------------------------------------------------------------ */

function isCancellation(e: unknown): boolean {
  const message = (e instanceof Error ? e.message : String(e)).toLowerCase();
  return (
    message.includes('cancel') ||
    message.includes('no image picked') ||
    message.includes('no image selected')
  );
}

function isPermissionDenial(e: unknown): boolean {
  const message = (e instanceof Error ? e.message : String(e)).toLowerCase();
  return message.includes('denied') || message.includes('permission');
}

/** Opens the OS file chooser. Used in the browser and as a native fallback. */
function pickWithFileInput(source: CaptureSource): Promise<File | null> {
  return new Promise((resolve, reject) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    if (source === 'camera') input.capture = 'environment';
    input.style.display = 'none';
    let settled = false;
    const finish = (value: File | null) => {
      if (settled) return;
      settled = true;
      input.remove();
      resolve(value);
    };
    input.addEventListener('change', () => {
      const file = input.files?.[0] ?? null;
      if (!file) return finish(null);
      try {
        assertValidImageFile({ type: file.type, name: file.name, size: file.size });
        finish(file);
      } catch (e) {
        settled = true;
        input.remove();
        reject(e);
      }
    });
    input.addEventListener('cancel', () => finish(null));
    document.body.appendChild(input);
    input.click();
  });
}

async function ensureCameraPermission(): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;
  try {
    const status = await Camera.checkPermissions();
    if (status.camera === 'granted' || status.camera === 'limited') return;
    const requested = await Camera.requestPermissions({ permissions: ['camera'] });
    if (requested.camera !== 'granted' && requested.camera !== 'limited') {
      throw new AppError(
        'CAMERA_PERMISSION',
        'Camera access is blocked. Enable it in Android Settings › Apps › Permissions.',
      );
    }
  } catch (e) {
    if (e instanceof AppError) throw e;
    logError('ensureCameraPermission', e);
    throw new AppError('CAMERA_PERMISSION', 'Camera permission could not be confirmed.', e);
  }
}

/**
 * Captures and compresses one photo. Resolves to `null` when the user backs
 * out of the camera or picker — cancelling is not an error.
 */
export async function captureIdImage(
  source: CaptureSource,
  options: CompressOptions = {},
): Promise<PreparedImage | null> {
  if (!Capacitor.isNativePlatform()) {
    const file = await pickWithFileInput(source);
    return file ? compressImage(file, options) : null;
  }

  if (source === 'camera') await ensureCameraPermission();

  try {
    const photo = await Camera.getPhoto({
      source: source === 'camera' ? CameraSource.Camera : CameraSource.Photos,
      resultType: CameraResultType.DataUrl,
      // Ask the plugin for a pre-shrunk image so the WebView never has to hold
      // a 12 MP bitmap; compressImage() then does the final 800x600 pass.
      quality: 80,
      width: 1600,
      correctOrientation: true,
      saveToGallery: false, // the original must not be retained
      allowEditing: false,
    });
    if (!photo.dataUrl) {
      throw new AppError('INVALID_IMAGE', 'The camera returned an empty photo. Please try again.');
    }
    return await compressImage(photo.dataUrl, options);
  } catch (e) {
    if (e instanceof AppError) throw e;
    if (isCancellation(e)) return null;
    if (isPermissionDenial(e)) {
      throw new AppError(
        'CAMERA_PERMISSION',
        source === 'camera'
          ? 'Camera access was denied. Enable it in Android Settings › Apps › Permissions.'
          : 'Photo access was denied. Enable it in Android Settings › Apps › Permissions.',
      );
    }
    logError('captureIdImage', e);
    throw new AppError(
      'CAMERA_UNAVAILABLE',
      source === 'camera'
        ? 'The camera could not be opened on this device.'
        : 'The photo gallery could not be opened on this device.',
      e,
    );
  }
}

/* ------------------------------------------------------------------ */
/* Storage                                                             */
/* ------------------------------------------------------------------ */

export class ImageService {
  constructor(private readonly files: FileStore) {}

  /** Writes the compressed image + thumbnail for one ID side. */
  async storeIdImage(
    customerCode: string,
    side: IdSide,
    image: PreparedImage,
  ): Promise<StoredIdImage> {
    const dir = customerDir(customerCode);
    const names = idImageNames(side);
    const full = await this.files.write(`${dir}/${names.full}`, image.full);
    const thumb = await this.files.write(`${dir}/${names.thumb}`, image.thumb);
    return { path: full.path, thumbPath: thumb.path, bytes: image.bytes };
  }

  /**
   * Copies a previous booking's ID photos into a new booking's folder.
   *
   * The files are duplicated rather than shared: each booking owns its photos,
   * so deleting an old stay can never strip the ID proof from a later one.
   */
  async copyIdImages(
    from: { customer_code: string; id_front_path: string; id_back_path: string },
    toCustomerCode: string,
  ): Promise<{ front: StoredIdImage; back: StoredIdImage }> {
    const dir = customerDir(toCustomerCode);
    const out: Partial<Record<IdSide, StoredIdImage>> = {};

    for (const side of ['front', 'back'] as IdSide[]) {
      const sourcePath = side === 'front' ? from.id_front_path : from.id_back_path;
      const names = idImageNames(side);
      let bytes: Uint8Array;
      try {
        bytes = await this.files.read(sourcePath);
      } catch (e) {
        throw new AppError(
          'MISSING_FILE',
          `The saved ID ${side} photo for ${from.customer_code} is no longer on this device. ` +
            'Please take a new photo for this check-in.',
          e,
        );
      }
      const full = await this.files.write(`${dir}/${names.full}`, bytes);

      // The thumbnail is a nice-to-have; fall back to the full image if the
      // old record predates thumbnails or its thumb file is gone.
      let thumbPath = full.path;
      const sourceThumb = sourcePath.replace(/\.jpg$/, '-thumb.jpg');
      try {
        const thumbBytes = await this.files.read(sourceThumb);
        thumbPath = (await this.files.write(`${dir}/${names.thumb}`, thumbBytes)).path;
      } catch {
        thumbPath = (await this.files.write(`${dir}/${names.thumb}`, bytes)).path;
      }

      out[side] = { path: full.path, thumbPath, bytes: bytes.length };
    }

    return { front: out.front!, back: out.back! };
  }

  /** Writes one ID side for an additional guest on a booking. */
  async storeGuestIdImage(
    customerCode: string,
    guestId: number,
    side: IdSide,
    image: PreparedImage,
  ): Promise<StoredIdImage> {
    const dir = guestDir(customerCode, guestId);
    const names = idImageNames(side);
    const full = await this.files.write(`${dir}/${names.full}`, image.full);
    const thumb = await this.files.write(`${dir}/${names.thumb}`, image.thumb);
    return { path: full.path, thumbPath: thumb.path, bytes: image.bytes };
  }

  /** Removes an additional guest's photo folder, tolerating missing files. */
  async removeGuestImages(customerCode: string, guestId: number): Promise<void> {
    await this.files.removeDir(guestDir(customerCode, guestId));
  }

  /** Removes every stored file for a customer, tolerating missing files. */
  async removeCustomerImages(customerCode: string, extraPaths: (string | null)[] = []): Promise<void> {
    for (const path of extraPaths) {
      if (path) await this.files.remove(path);
    }
    await this.files.removeDir(customerDir(customerCode));
  }

  async displaySrc(path: string | null): Promise<string | null> {
    if (!path) return null;
    try {
      return await this.files.displaySrc(path);
    } catch (e) {
      logError('displaySrc', e);
      return null;
    }
  }

  /** Prefers the small thumbnail, falls back to the full image. */
  async previewSrc(thumbPath: string | null, fullPath: string | null): Promise<string | null> {
    if (thumbPath) {
      const src = await this.displaySrc(thumbPath);
      if (src) return src;
    }
    return this.displaySrc(fullPath);
  }

  async exists(path: string | null): Promise<boolean> {
    return path ? this.files.exists(path) : false;
  }
}
