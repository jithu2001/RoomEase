/**
 * Local file storage seam.
 *
 * ID photos live in the app's *private* data directory
 * (`Directory.Data/hotel-data/customers/<CODE>/…`), which no other app and no
 * gallery scanner can read. Only backup archives are written to a
 * user-reachable location.
 *
 * The `FileStore` interface lets the service layer be unit tested with the
 * in-memory implementation at the bottom of this file.
 */

import { Capacitor } from '@capacitor/core';
import { Directory, Filesystem } from '@capacitor/filesystem';
import { base64ToBytes, bytesToBase64, bytesToDataUrl } from '../utils/base64';
import { AppError, logError } from '../utils/errors';

export const DATA_ROOT = 'hotel-data';
export const CUSTOMERS_ROOT = `${DATA_ROOT}/customers`;
/** Folder name used under the shared storage root for backup archives. */
export const BACKUP_DIR = 'backups';
/** Subfolder holding automatic (scheduled) backups, pruned by retention. */
export const AUTO_BACKUP_DIR = 'auto';

export function customerDir(customerCode: string): string {
  return `${CUSTOMERS_ROOT}/${customerCode}`;
}

/**
 * A companion's photos live *inside* the booking's folder, so deleting the
 * booking removes them with one recursive delete and no extra bookkeeping.
 */
export function guestDir(customerCode: string, guestId: number): string {
  return `${customerDir(customerCode)}/guests/${guestId}`;
}

export interface SharedFile {
  /** Path relative to the shared root, e.g. `backups/auto/x.zip`. */
  path: string;
  name: string;
  size: number;
  /** Epoch millis; 0 when the platform does not report a timestamp. */
  modifiedAt: number;
}

export interface SaveResult {
  /** Path relative to the storage root — this is what goes into SQLite. */
  path: string;
}

export interface FileStore {
  write(path: string, bytes: Uint8Array): Promise<SaveResult>;
  read(path: string): Promise<Uint8Array>;
  exists(path: string): Promise<boolean>;
  /** Never throws when the file is already gone. */
  remove(path: string): Promise<void>;
  /** Recursively removes a directory; never throws when missing. */
  removeDir(path: string): Promise<void>;
  /** Recursive listing of file paths under `dir` (relative to the root). */
  listFiles(dir: string): Promise<string[]>;
  /** A URL usable as an <img src>. Throws MISSING_FILE when absent. */
  displaySrc(path: string): Promise<string>;
  /** Writes a shareable file (backups) and returns a human-readable location. */
  writeShared(
    fileName: string,
    bytes: Uint8Array,
    folder?: string,
  ): Promise<{ path: string; location: string }>;
  /** Lists shareable files, newest first. Used by backup retention. */
  listShared(folder?: string): Promise<SharedFile[]>;
  /** Deletes one shareable file; never throws when it is already gone. */
  removeShared(relativePath: string): Promise<void>;
}

/* ------------------------------------------------------------------ */
/* Capacitor implementation                                            */
/* ------------------------------------------------------------------ */

const PRIVATE_DIR = Directory.Data;

function parentOf(path: string): string {
  const i = path.lastIndexOf('/');
  return i === -1 ? '' : path.slice(0, i);
}

export class CapacitorFileStore implements FileStore {
  private readonly ensured = new Set<string>();
  private sharedDirectory: Directory | null = null;

  private async ensureDir(path: string): Promise<void> {
    if (!path || this.ensured.has(path)) return;
    try {
      await Filesystem.mkdir({ path, directory: PRIVATE_DIR, recursive: true });
    } catch {
      // Already exists — the plugin has no "create if missing" flag.
    }
    this.ensured.add(path);
  }

  async write(path: string, bytes: Uint8Array): Promise<SaveResult> {
    try {
      await this.ensureDir(parentOf(path));
      await Filesystem.writeFile({
        path,
        directory: PRIVATE_DIR,
        data: bytesToBase64(bytes),
        recursive: true,
      });
      return { path };
    } catch (e) {
      logError('fileStore.write', e);
      throw new AppError('FILESYSTEM', 'The photo could not be saved to this device.', e);
    }
  }

  async read(path: string): Promise<Uint8Array> {
    try {
      const result = await Filesystem.readFile({ path, directory: PRIVATE_DIR });
      if (typeof result.data === 'string') return base64ToBytes(result.data);
      // Web: the plugin hands back a Blob.
      return new Uint8Array(await (result.data as Blob).arrayBuffer());
    } catch (e) {
      throw new AppError('MISSING_FILE', 'This file is no longer available on the device.', e);
    }
  }

  async exists(path: string): Promise<boolean> {
    try {
      await Filesystem.stat({ path, directory: PRIVATE_DIR });
      return true;
    } catch {
      return false;
    }
  }

  async remove(path: string): Promise<void> {
    if (!path) return;
    try {
      await Filesystem.deleteFile({ path, directory: PRIVATE_DIR });
    } catch (e) {
      // Missing files are not an error when cleaning up.
      logError('fileStore.remove', e);
    }
  }

  async removeDir(path: string): Promise<void> {
    if (!path) return;
    try {
      await Filesystem.rmdir({ path, directory: PRIVATE_DIR, recursive: true });
    } catch (e) {
      logError('fileStore.removeDir', e);
    }
    this.ensured.delete(path);
  }

  async listFiles(dir: string): Promise<string[]> {
    const out: string[] = [];
    const walk = async (current: string): Promise<void> => {
      let entries: { name: string; type: string }[];
      try {
        const result = await Filesystem.readdir({ path: current, directory: PRIVATE_DIR });
        entries = result.files.map((f) => ({ name: f.name, type: f.type }));
      } catch {
        return; // directory missing — nothing to list
      }
      for (const entry of entries) {
        const child = `${current}/${entry.name}`;
        if (entry.type === 'directory') await walk(child);
        else out.push(child);
      }
    };
    await walk(dir);
    return out;
  }

  async displaySrc(path: string): Promise<string> {
    if (!path) throw new AppError('MISSING_FILE', 'No image is attached to this record.');
    if (Capacitor.isNativePlatform()) {
      try {
        const { uri } = await Filesystem.getUri({ path, directory: PRIVATE_DIR });
        // Rewrites file:// to the WebView-accessible localhost bridge URL.
        return Capacitor.convertFileSrc(uri);
      } catch (e) {
        throw new AppError('MISSING_FILE', 'This ID photo could not be found on the device.', e);
      }
    }
    // Browser: IndexedDB-backed files have no addressable URL, so inline them.
    const bytes = await this.read(path);
    return bytesToDataUrl(bytes, 'image/jpeg');
  }

  /**
   * Resolves (once) where shareable files live.
   *
   * Directory.External is the app-specific folder on shared storage: reachable
   * over USB or a file manager, but needing no runtime permission. If it is
   * unavailable, the app falls back to private storage so a backup still gets
   * written. Caching the choice keeps write/list/remove on the same root.
   */
  private async sharedRoot(): Promise<Directory> {
    if (this.sharedDirectory) return this.sharedDirectory;
    for (const directory of [Directory.External, Directory.Data]) {
      try {
        await Filesystem.mkdir({ path: BACKUP_DIR, directory, recursive: true });
      } catch {
        // Already exists, or not creatable - the readdir below decides.
      }
      try {
        await Filesystem.readdir({ path: BACKUP_DIR, directory });
        this.sharedDirectory = directory;
        return directory;
      } catch {
        // Try the next candidate.
      }
    }
    throw new AppError('BACKUP_FAILED', 'No writable storage was found for backups.');
  }

  async writeShared(
    fileName: string,
    bytes: Uint8Array,
    folder = '',
  ): Promise<{ path: string; location: string }> {
    const directory = await this.sharedRoot();
    const relative = folder ? `${BACKUP_DIR}/${folder}/${fileName}` : `${BACKUP_DIR}/${fileName}`;
    try {
      await Filesystem.writeFile({
        path: relative,
        directory,
        data: bytesToBase64(bytes),
        recursive: true,
      });
      const { uri } = await Filesystem.getUri({ path: relative, directory });
      return { path: relative, location: uri || relative };
    } catch (e) {
      logError('fileStore.writeShared', e);
      throw new AppError('BACKUP_FAILED', 'The backup file could not be written to storage.', e);
    }
  }

  async listShared(folder = ''): Promise<SharedFile[]> {
    const relative = folder ? `${BACKUP_DIR}/${folder}` : BACKUP_DIR;
    try {
      const directory = await this.sharedRoot();
      const result = await Filesystem.readdir({ path: relative, directory });
      return result.files
        .filter((entry) => entry.type !== 'directory')
        .map((entry) => ({
          path: `${relative}/${entry.name}`,
          name: entry.name,
          size: entry.size ?? 0,
          modifiedAt: entry.mtime ?? 0,
        }))
        .sort((a, b) => b.modifiedAt - a.modifiedAt || b.name.localeCompare(a.name));
    } catch {
      return [];
    }
  }

  async removeShared(relativePath: string): Promise<void> {
    if (!relativePath) return;
    try {
      await Filesystem.deleteFile({ path: relativePath, directory: await this.sharedRoot() });
    } catch (e) {
      logError('fileStore.removeShared', e);
    }
  }
}

/* ------------------------------------------------------------------ */
/* In-memory implementation (tests)                                    */
/* ------------------------------------------------------------------ */

export class MemoryFileStore implements FileStore {
  readonly files = new Map<string, Uint8Array>();
  readonly shared = new Map<string, Uint8Array>();
  /** Monotonic stand-in for mtime, so retention ordering is deterministic. */
  private readonly sharedTimes = new Map<string, number>();
  private clock = 1;

  async write(path: string, bytes: Uint8Array): Promise<SaveResult> {
    this.files.set(path, new Uint8Array(bytes));
    return { path };
  }

  async read(path: string): Promise<Uint8Array> {
    const bytes = this.files.get(path);
    if (!bytes) throw new AppError('MISSING_FILE', 'This file is no longer available.');
    return bytes;
  }

  async exists(path: string): Promise<boolean> {
    return this.files.has(path);
  }

  async remove(path: string): Promise<void> {
    this.files.delete(path);
  }

  async removeDir(path: string): Promise<void> {
    const prefix = path.endsWith('/') ? path : `${path}/`;
    for (const key of [...this.files.keys()]) {
      if (key === path || key.startsWith(prefix)) this.files.delete(key);
    }
  }

  async listFiles(dir: string): Promise<string[]> {
    const prefix = dir.endsWith('/') ? dir : `${dir}/`;
    return [...this.files.keys()].filter((k) => k.startsWith(prefix)).sort();
  }

  async displaySrc(path: string): Promise<string> {
    return bytesToDataUrl(await this.read(path));
  }

  async writeShared(fileName: string, bytes: Uint8Array, folder = '') {
    const relative = folder ? `${BACKUP_DIR}/${folder}/${fileName}` : `${BACKUP_DIR}/${fileName}`;
    this.shared.set(relative, new Uint8Array(bytes));
    this.sharedTimes.set(relative, this.clock++);
    return { path: relative, location: `memory://${relative}` };
  }

  async listShared(folder = ''): Promise<SharedFile[]> {
    const prefix = folder ? `${BACKUP_DIR}/${folder}/` : `${BACKUP_DIR}/`;
    return [...this.shared.entries()]
      .filter(([path]) => path.startsWith(prefix) && !path.slice(prefix.length).includes('/'))
      .map(([path, bytes]) => ({
        path,
        name: path.slice(path.lastIndexOf('/') + 1),
        size: bytes.length,
        modifiedAt: this.sharedTimes.get(path) ?? 0,
      }))
      .sort((a, b) => b.modifiedAt - a.modifiedAt || b.name.localeCompare(a.name));
  }

  async removeShared(relativePath: string): Promise<void> {
    this.shared.delete(relativePath);
    this.sharedTimes.delete(relativePath);
  }
}
