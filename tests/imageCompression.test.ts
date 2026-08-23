import { describe, expect, it } from 'vitest';
import {
  assertValidImageDataUrl,
  assertValidImageFile,
  computeTargetSize,
  DEFAULT_COMPRESS_OPTIONS,
  formatBytes,
  isSupportedImageMime,
  mimeFromDataUrl,
} from '../src/utils/imageCompression';
import { base64ByteLength, base64ToBytes, bytesToBase64, bytesToDataUrl } from '../src/utils/base64';

const { maxWidth, maxHeight } = DEFAULT_COMPRESS_OPTIONS;

describe('resize geometry', () => {
  it('fits a landscape phone photo inside 800x600', () => {
    expect(computeTargetSize({ width: 4000, height: 3000 }, maxWidth, maxHeight)).toEqual({
      width: 800,
      height: 600,
    });
  });

  it('fits a portrait photo inside 800x600 without distortion', () => {
    const size = computeTargetSize({ width: 3000, height: 4000 }, maxWidth, maxHeight);
    expect(size).toEqual({ width: 450, height: 600 });
    expect(size.width / size.height).toBeCloseTo(3000 / 4000, 5);
  });

  it('handles very wide ID cards', () => {
    const size = computeTargetSize({ width: 5000, height: 1000 }, maxWidth, maxHeight);
    expect(size).toEqual({ width: 800, height: 160 });
  });

  it('never upscales a small image', () => {
    expect(computeTargetSize({ width: 320, height: 240 }, maxWidth, maxHeight)).toEqual({
      width: 320,
      height: 240,
    });
  });

  it('keeps at least one pixel', () => {
    expect(computeTargetSize({ width: 10000, height: 1 }, maxWidth, maxHeight)).toEqual({
      width: 800,
      height: 1,
    });
  });

  it('rejects an image with no readable dimensions', () => {
    expect(() => computeTargetSize({ width: 0, height: 0 }, maxWidth, maxHeight)).toThrow(
      /no readable dimensions/i,
    );
  });

  it('scales thumbnails from the already-resized image', () => {
    const full = computeTargetSize({ width: 4000, height: 3000 }, maxWidth, maxHeight);
    const thumb = computeTargetSize(full, 240, 240);
    expect(thumb).toEqual({ width: 240, height: 180 });
  });
});

describe('image validation', () => {
  it('accepts formats an Android camera or gallery can produce', () => {
    for (const mime of ['image/jpeg', 'image/png', 'image/webp', 'image/heic']) {
      expect(isSupportedImageMime(mime)).toBe(true);
    }
    expect(isSupportedImageMime('IMAGE/JPEG')).toBe(true);
  });

  it('rejects non-images', () => {
    expect(isSupportedImageMime('application/pdf')).toBe(false);
    expect(isSupportedImageMime('')).toBe(false);
    expect(isSupportedImageMime(null)).toBe(false);
  });

  it('accepts a file by extension when the mime type is missing', () => {
    expect(() => assertValidImageFile({ type: '', name: 'scan.jpg', size: 2048 })).not.toThrow();
    expect(() => assertValidImageFile({ type: '', name: 'notes.pdf', size: 2048 })).toThrow(
      /not a supported image/i,
    );
  });

  it('rejects empty and oversized files', () => {
    expect(() => assertValidImageFile({ type: 'image/jpeg', size: 0 })).toThrow(/empty/i);
    expect(() => assertValidImageFile({ type: 'image/jpeg', size: 41 * 1024 * 1024 })).toThrow(
      /too large/i,
    );
  });

  it('reads the mime type out of a data url', () => {
    expect(mimeFromDataUrl('data:image/jpeg;base64,AAAA')).toBe('image/jpeg');
    expect(mimeFromDataUrl('not-a-data-url')).toBeNull();
  });

  it('rejects a camera result that is not a real image', () => {
    expect(() => assertValidImageDataUrl('data:text/plain;base64,aGk=')).toThrow(
      /not a supported image/i,
    );
    expect(() => assertValidImageDataUrl('data:image/jpeg;base64,AA==')).toThrow(/empty/i);
    expect(() => assertValidImageDataUrl('file:///tmp/x.jpg')).toThrow(/could not be read/i);
  });

  it('accepts a plausible jpeg data url', () => {
    const bytes = new Uint8Array(400).fill(7);
    bytes.set([0xff, 0xd8, 0xff], 0);
    expect(() => assertValidImageDataUrl(bytesToDataUrl(bytes))).not.toThrow();
  });
});

describe('binary helpers', () => {
  it('round-trips bytes through base64', () => {
    const bytes = new Uint8Array(1000).map((_, i) => i % 256);
    expect(base64ToBytes(bytesToBase64(bytes))).toEqual(bytes);
  });

  it('round-trips through a data url', () => {
    const bytes = new Uint8Array([1, 2, 3, 250, 251, 252]);
    expect(base64ToBytes(bytesToDataUrl(bytes))).toEqual(bytes);
  });

  it('measures the decoded size without decoding', () => {
    for (const length of [1, 2, 3, 100, 1023, 4096]) {
      const bytes = new Uint8Array(length).fill(3);
      expect(base64ByteLength(bytesToDataUrl(bytes))).toBe(length);
    }
  });

  it('handles large buffers without blowing the call stack', () => {
    const bytes = new Uint8Array(300_000).fill(9);
    expect(base64ToBytes(bytesToBase64(bytes)).length).toBe(300_000);
  });
});

describe('size formatting', () => {
  it('formats bytes for the preview caption', () => {
    expect(formatBytes(512)).toBe('512 B');
    expect(formatBytes(94 * 1024)).toBe('94 KB');
    expect(formatBytes(3 * 1024 * 1024)).toBe('3.0 MB');
  });
});
