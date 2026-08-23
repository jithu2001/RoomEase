/**
 * Base64 helpers.
 *
 * The Capacitor Filesystem plugin exchanges binary data as base64 strings, so
 * these are used by the file store, the image pipeline and backup/restore.
 * `atob`/`btoa` are available both in the Android WebView and in Node, which
 * keeps this file testable without a DOM.
 */

const CHUNK = 0x8000; // 32 KB — avoids "too many arguments" on big buffers.

export function bytesToBase64(bytes: Uint8Array): string {
  let out = '';
  for (let i = 0; i < bytes.length; i += CHUNK) {
    out += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(out);
}

export function base64ToBytes(base64: string): Uint8Array {
  const clean = stripDataUrlPrefix(base64);
  const binary = atob(clean);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

export function stripDataUrlPrefix(value: string): string {
  const comma = value.indexOf(',');
  return value.startsWith('data:') && comma !== -1 ? value.slice(comma + 1) : value;
}

export function bytesToDataUrl(bytes: Uint8Array, mime = 'image/jpeg'): string {
  return `data:${mime};base64,${bytesToBase64(bytes)}`;
}

/** Byte length of the payload a base64 string decodes to (no allocation). */
export function base64ByteLength(base64: string): number {
  const clean = stripDataUrlPrefix(base64).replace(/[\r\n]/g, '');
  if (!clean) return 0;
  const padding = clean.endsWith('==') ? 2 : clean.endsWith('=') ? 1 : 0;
  return Math.floor((clean.length * 3) / 4) - padding;
}

export function utf8ToBytes(text: string): Uint8Array {
  return new TextEncoder().encode(text);
}

export function bytesToUtf8(bytes: Uint8Array): string {
  return new TextDecoder().decode(bytes);
}
