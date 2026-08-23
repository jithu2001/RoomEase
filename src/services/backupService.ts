/**
 * Local backup / restore.
 *
 * There is no cloud in this app, so the ZIP produced here is the only copy of
 * the hotel's data other than the device itself. The archive layout is:
 *
 *   manifest.json                     format + version + counts
 *   data.json                         customers, rooms, settings
 *   images/CUS-000001/id-front.jpg    compressed ID photos (optional)
 *
 * Restore is defensive on purpose: a truncated or foreign ZIP must produce a
 * clear message, never a half-written database.
 */

import { unzipSync, zipSync, type Unzipped, type Zippable } from 'fflate';
import { backupStamp, nowIso } from '../utils/date';
import { bytesToUtf8, utf8ToBytes } from '../utils/base64';
import { AppError, logError } from '../utils/errors';
import { isSafeCustomerCode } from '../utils/customerCode';
import { CUSTOMER_STATUS, type BookingGuest, type Customer, type CustomerStatus } from '../types';
import { CUSTOMERS_ROOT, customerDir, guestDir, type FileStore } from './fileStore';
import type { BookingGuestRepository } from '../database/repositories/bookingGuestRepository';
import type { CustomerRepository } from '../database/repositories/customerRepository';
import type { RoomRepository } from '../database/repositories/roomRepository';
import type { SettingsRepository } from '../database/repositories/settingsRepository';
import type { SqlDriver } from '../database/driver';
import { getSchemaVersion, LATEST_VERSION } from '../database/migrations';

export const BACKUP_FORMAT = 'hotel-customer-manager-backup';
export const BACKUP_FORMAT_VERSION = 1;
/** Guard against building an archive too large to hold in WebView memory. */
export const MAX_IMAGE_BYTES = 200 * 1024 * 1024;

/** Settings that must never travel in a backup (would lock a new device out). */
const EXCLUDED_SETTINGS = new Set(['pin_hash']);

export interface BackupManifest {
  format: string;
  version: number;
  schema_version: number;
  created_at: string;
  includes_images: boolean;
  counts: { customers: number; rooms: number; images: number; guests?: number };
}

export interface BackupPayload {
  customers: Customer[];
  /** Added with migration 5; absent in archives written before it. */
  guests?: BookingGuest[];
  rooms: { room_number: string; created_at: string }[];
  settings: Record<string, string>;
}

export interface ExportResult {
  fileName: string;
  /** Path relative to the shared storage root, e.g. backups/hotel-backup-....zip */
  path: string;
  location: string;
  bytes: number;
  customers: number;
  images: number;
  warnings: string[];
}

export interface RestoreSummary {
  customers: number;
  guests: number;
  rooms: number;
  images: number;
  warnings: string[];
}

function jsonBytes(value: unknown): Uint8Array {
  return utf8ToBytes(JSON.stringify(value, null, 2));
}

function parseJson<T>(bytes: Uint8Array, what: string): T {
  try {
    return JSON.parse(bytesToUtf8(bytes)) as T;
  } catch (e) {
    throw new AppError('CORRUPT_BACKUP', `The backup file is damaged (${what} is unreadable).`, e);
  }
}

/**
 * Rejects anything that could escape the customers directory.
 * Accepts both a booking's own photos and an additional guest's:
 *   images/CUS-000001/id-front.jpg
 *   images/CUS-000001/guests/12/id-front.jpg
 */
function safeImageEntry(
  entryPath: string,
): { code: string; fileName: string; guestId?: number } | null {
  const match = /^images\/(CUS-\d{6,})\/(?:guests\/(\d{1,12})\/)?([A-Za-z0-9._-]+\.jpg)$/.exec(
    entryPath,
  );
  if (!match) return null;
  const [, code, guestId, fileName] = match;
  if (!isSafeCustomerCode(code)) return null;
  return guestId ? { code, fileName, guestId: Number(guestId) } : { code, fileName };
}

function isStatus(value: unknown): value is CustomerStatus {
  return value === CUSTOMER_STATUS.CHECKED_IN || value === CUSTOMER_STATUS.CHECKED_OUT;
}

export class BackupService {
  constructor(
    private readonly db: SqlDriver,
    private readonly customers: CustomerRepository,
    private readonly guests: BookingGuestRepository,
    private readonly rooms: RoomRepository,
    private readonly settings: SettingsRepository,
    private readonly files: FileStore,
  ) {}

  /* ---------------------------------------------------------------- */
  /* Export                                                           */
  /* ---------------------------------------------------------------- */

  /** Builds the archive in memory and returns its bytes plus a manifest. */
  async buildArchive(includeImages = true): Promise<{ bytes: Uint8Array; manifest: BackupManifest; warnings: string[] }> {
    const warnings: string[] = [];
    const [customers, guests, rooms, settingsMap, schemaVersion] = await Promise.all([
      this.customers.listAll(),
      this.guests.listAll(),
      this.rooms.list(),
      this.settings.getAll(),
      getSchemaVersion(this.db),
    ]);
    const codeById = new Map(customers.map((c) => [c.id, c.customer_code]));

    const settings: Record<string, string> = {};
    for (const [key, value] of Object.entries(settingsMap)) {
      if (!EXCLUDED_SETTINGS.has(key)) settings[key] = value;
    }

    const payload: BackupPayload = {
      customers,
      guests,
      rooms: rooms.map((r) => ({ room_number: r.room_number, created_at: r.created_at })),
      settings,
    };

    const images: Record<string, Uint8Array> = {};
    let imageBytes = 0;
    if (includeImages) {
      for (const customer of customers) {
        const paths = [
          customer.id_front_path,
          customer.id_back_path,
          customer.id_front_thumb_path,
          customer.id_back_thumb_path,
        ].filter((p): p is string => Boolean(p));
        for (const path of paths) {
          const fileName = path.slice(path.lastIndexOf('/') + 1);
          try {
            const bytes = await this.files.read(path);
            imageBytes += bytes.length;
            if (imageBytes > MAX_IMAGE_BYTES) {
              throw new AppError(
                'BACKUP_FAILED',
                'There are too many ID photos to fit in one archive. Use "Export data only" and copy the hotel-data folder manually.',
              );
            }
            images[`images/${customer.customer_code}/${fileName}`] = bytes;
          } catch (e) {
            if (e instanceof AppError && e.code === 'BACKUP_FAILED') throw e;
            warnings.push(`${customer.customer_code}: ${fileName} is missing on this device`);
          }
        }
      }

      // Additional guests' photos, nested under their booking.
      for (const guest of guests) {
        const code = codeById.get(guest.customer_id);
        if (!code) continue;
        const paths = [
          guest.id_front_path,
          guest.id_back_path,
          guest.id_front_thumb_path,
          guest.id_back_thumb_path,
        ].filter((p): p is string => Boolean(p));
        for (const path of paths) {
          const fileName = path.slice(path.lastIndexOf('/') + 1);
          try {
            const bytes = await this.files.read(path);
            imageBytes += bytes.length;
            if (imageBytes > MAX_IMAGE_BYTES) {
              throw new AppError(
                'BACKUP_FAILED',
                'There are too many ID photos to fit in one archive. Use "Export data only" and copy the hotel-data folder manually.',
              );
            }
            images[`images/${code}/guests/${guest.id}/${fileName}`] = bytes;
          } catch (e) {
            if (e instanceof AppError && e.code === 'BACKUP_FAILED') throw e;
            warnings.push(`${code} guest ${guest.name}: ${fileName} is missing on this device`);
          }
        }
      }
    }

    const manifest: BackupManifest = {
      format: BACKUP_FORMAT,
      version: BACKUP_FORMAT_VERSION,
      schema_version: schemaVersion || LATEST_VERSION,
      created_at: nowIso(),
      includes_images: includeImages,
      counts: {
        customers: customers.length,
        rooms: rooms.length,
        images: Object.keys(images).length,
        guests: guests.length,
      },
    };

    const zippable: Zippable = {
      'manifest.json': [jsonBytes(manifest), { level: 6 }],
      'data.json': [jsonBytes(payload), { level: 6 }],
    };
    for (const [name, bytes] of Object.entries(images)) {
      // JPEGs are already compressed — storing them avoids pointless CPU work.
      zippable[name] = [bytes, { level: 0 }];
    }

    try {
      return { bytes: zipSync(zippable), manifest, warnings };
    } catch (e) {
      logError('buildArchive', e);
      throw new AppError('BACKUP_FAILED', 'The backup archive could not be created.', e);
    }
  }

  /** Builds the archive and writes it to device storage. */
  async exportBackup(includeImages = true): Promise<ExportResult> {
    const { bytes, manifest, warnings } = await this.buildArchive(includeImages);
    const fileName = `hotel-backup-${backupStamp()}${includeImages ? '' : '-data-only'}.zip`;
    const written = await this.files.writeShared(fileName, bytes);
    await this.settings.set('last_backup_at', nowIso());
    return {
      fileName,
      path: written.path,
      location: written.location,
      bytes: bytes.length,
      customers: manifest.counts.customers,
      images: manifest.counts.images,
      warnings,
    };
  }

  /* ---------------------------------------------------------------- */
  /* Inspect + restore                                                */
  /* ---------------------------------------------------------------- */

  private unzip(archive: Uint8Array): Unzipped {
    if (archive.length === 0) {
      throw new AppError('CORRUPT_BACKUP', 'That backup file is empty.');
    }
    // Local file header magic "PK\x03\x04".
    if (!(archive[0] === 0x50 && archive[1] === 0x4b)) {
      throw new AppError('CORRUPT_BACKUP', 'That file is not a hotel backup archive (.zip expected).');
    }
    try {
      return unzipSync(archive);
    } catch (e) {
      throw new AppError('CORRUPT_BACKUP', 'That backup archive is damaged and cannot be opened.', e);
    }
  }

  /** Validates an archive without touching the database. */
  async inspect(archive: Uint8Array): Promise<{ manifest: BackupManifest; payload: BackupPayload }> {
    return this.readPayload(this.unzip(archive));
  }

  private readPayload(entries: Unzipped): { manifest: BackupManifest; payload: BackupPayload } {
    const manifestBytes = entries['manifest.json'];
    const dataBytes = entries['data.json'];
    if (!manifestBytes || !dataBytes) {
      throw new AppError(
        'CORRUPT_BACKUP',
        'That archive is missing its backup manifest — it was not created by this app.',
      );
    }
    const manifest = parseJson<BackupManifest>(manifestBytes, 'the manifest');
    if (manifest.format !== BACKUP_FORMAT) {
      throw new AppError('CORRUPT_BACKUP', 'That archive was not created by this app.');
    }
    if (typeof manifest.version !== 'number' || manifest.version > BACKUP_FORMAT_VERSION) {
      throw new AppError(
        'CORRUPT_BACKUP',
        'That backup was created by a newer version of the app. Please update the app first.',
      );
    }
    const payload = parseJson<BackupPayload>(dataBytes, 'the customer data');
    if (!Array.isArray(payload.customers) || !Array.isArray(payload.rooms)) {
      throw new AppError('CORRUPT_BACKUP', 'The backup data is incomplete or damaged.');
    }
    return { manifest, payload };
  }

  /**
   * Replaces all local data with the archive contents.
   * The database is swapped inside a transaction, then the ID photos are
   * rewritten; a photo that fails to write is reported as a warning rather
   * than failing the whole restore.
   */
  async restoreBackup(archive: Uint8Array): Promise<RestoreSummary> {
    const entries = this.unzip(archive);
    const { payload } = this.readPayload(entries);
    const warnings: string[] = [];

    const customers: Customer[] = [];
    payload.customers.forEach((raw, index) => {
      const problem = describeCustomerProblem(raw);
      if (problem) {
        warnings.push(`Record ${index + 1} was skipped (${problem})`);
        return;
      }
      customers.push(normaliseRestoredCustomer(raw));
    });

    // Deduplicate active rooms: the unique index would otherwise abort the
    // whole restore because of one inconsistent record.
    const activeRooms = new Set<string>();
    for (const customer of customers) {
      if (customer.status !== CUSTOMER_STATUS.CHECKED_IN) continue;
      if (activeRooms.has(customer.room_number)) {
        customer.status = CUSTOMER_STATUS.CHECKED_OUT;
        customer.check_out_date = customer.check_out_date ?? customer.updated_at;
        warnings.push(
          `${customer.customer_code} was marked checked out: room ${customer.room_number} had two active guests`,
        );
      } else {
        activeRooms.add(customer.room_number);
      }
    }

    // Companions are only restorable if their booking survived validation; a
    // dangling customer_id would be rejected by the foreign key and abort the
    // whole restore.
    const codeByCustomerId = new Map(customers.map((c) => [c.id, c.customer_code]));
    const restoredGuests: BookingGuest[] = [];
    for (const [index, raw] of (payload.guests ?? []).entries()) {
      const problem = describeGuestProblem(raw, codeByCustomerId);
      if (problem) {
        warnings.push(`Guest record ${index + 1} was skipped (${problem})`);
        continue;
      }
      restoredGuests.push(
        normaliseRestoredGuest(raw as BookingGuest, codeByCustomerId.get(raw.customer_id)!),
      );
    }

    const roomNumbers = new Set<string>(
      payload.rooms
        .map((r) => String(r.room_number ?? '').trim())
        .filter((r) => r.length > 0),
    );
    // Rooms referenced by restored bookings must exist, or availability breaks.
    for (const room of activeRooms) roomNumbers.add(room);

    try {
      await this.db.transaction(async () => {
        // Guests first: the foreign key would block deleting their bookings.
        await this.guests.deleteAll();
        await this.customers.deleteAll();
        await this.rooms.deleteAll();
        const created = nowIso();
        for (const room of roomNumbers) {
          await this.rooms.insert(room, created);
        }
        for (const customer of customers) {
          await this.customers.insertRaw(customer);
        }
        for (const guest of restoredGuests) {
          await this.guests.insertRaw(guest);
        }
        for (const [key, value] of Object.entries(payload.settings ?? {})) {
          if (EXCLUDED_SETTINGS.has(key)) continue;
          await this.settings.set(key, String(value ?? ''));
        }
      });
    } catch (e) {
      logError('restoreBackup.db', e);
      throw new AppError(
        'RESTORE_FAILED',
        'The backup could not be written to the database. Your existing data has been left unchanged.',
        e,
      );
    }

    // Photos: clear the old tree, then unpack whatever the archive holds.
    let imageCount = 0;
    try {
      await this.files.removeDir(CUSTOMERS_ROOT);
    } catch (e) {
      logError('restoreBackup.clearImages', e);
    }
    for (const [entryPath, bytes] of Object.entries(entries)) {
      if (!entryPath.startsWith('images/')) continue;
      const safe = safeImageEntry(entryPath);
      if (!safe) {
        warnings.push(`Skipped an unexpected file in the archive: ${entryPath}`);
        continue;
      }
      try {
        const target =
          safe.guestId === undefined
            ? `${customerDir(safe.code)}/${safe.fileName}`
            : `${guestDir(safe.code, safe.guestId)}/${safe.fileName}`;
        await this.files.write(target, bytes);
        imageCount += 1;
      } catch (e) {
        logError('restoreBackup.image', e);
        warnings.push(`${safe.code}: ${safe.fileName} could not be restored`);
      }
    }

    await this.db.persist();
    return {
      customers: customers.length,
      guests: restoredGuests.length,
      rooms: roomNumbers.size,
      images: imageCount,
      warnings,
    };
  }
}

/* ------------------------------------------------------------------ */
/* Restore validation helpers                                          */
/* ------------------------------------------------------------------ */

function describeCustomerProblem(raw: unknown): string | null {
  if (!raw || typeof raw !== 'object') return 'not a customer record';
  const c = raw as Partial<Customer>;
  if (typeof c.customer_code !== 'string' || !isSafeCustomerCode(c.customer_code)) {
    return 'invalid customer code';
  }
  if (typeof c.name !== 'string' || !c.name.trim()) return 'missing name';
  if (typeof c.room_number !== 'string' || !c.room_number.trim()) return 'missing room';
  if (typeof c.check_in_date !== 'string' || !c.check_in_date) return 'missing check-in date';
  if (!isStatus(c.status)) return 'unknown status';
  return null;
}

/** Older archives have no amount; anything unparseable becomes "not recorded". */
function normaliseAmount(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isSafeInteger(n) && n >= 0 ? n : null;
}

function describeGuestProblem(
  raw: unknown,
  codeByCustomerId: Map<number, string>,
): string | null {
  if (!raw || typeof raw !== 'object') return 'not a guest record';
  const g = raw as Partial<BookingGuest>;
  if (typeof g.name !== 'string' || !g.name.trim()) return 'missing name';
  if (!Number.isInteger(g.customer_id)) return 'invalid booking reference';
  if (!codeByCustomerId.has(g.customer_id as number)) return 'its booking was not restored';
  return null;
}

/**
 * Paths are rebuilt from the booking code and guest id so an archive from
 * another device resolves. A guest who had no photo keeps null rather than
 * gaining a path to a file that does not exist.
 */
function normaliseRestoredGuest(raw: BookingGuest, customerCode: string): BookingGuest {
  const id = Number.isInteger(raw.id) && raw.id > 0 ? raw.id : 0;
  const dir = guestDir(customerCode, id);
  const phone = typeof raw.phone === 'string' && raw.phone.trim() ? raw.phone.trim() : null;
  return {
    id,
    customer_id: raw.customer_id,
    name: String(raw.name).trim(),
    phone,
    id_front_path: raw.id_front_path ? `${dir}/id-front.jpg` : null,
    id_front_thumb_path: raw.id_front_path ? `${dir}/id-front-thumb.jpg` : null,
    id_back_path: raw.id_back_path ? `${dir}/id-back.jpg` : null,
    id_back_thumb_path: raw.id_back_path ? `${dir}/id-back-thumb.jpg` : null,
    created_at: raw.created_at || raw.updated_at || '',
    updated_at: raw.updated_at || raw.created_at || '',
  };
}

function normaliseRestoredCustomer(raw: Customer): Customer {
  const code = raw.customer_code;
  const dir = customerDir(code);
  const persons = Number(raw.number_of_persons);
  return {
    id: Number.isInteger(raw.id) && raw.id > 0 ? raw.id : 0,
    customer_code: code,
    name: String(raw.name).trim(),
    address: String(raw.address ?? '').trim(),
    phone: String(raw.phone ?? '').trim(),
    room_number: String(raw.room_number).trim(),
    number_of_persons: Number.isFinite(persons) && persons > 0 ? Math.floor(persons) : 1,
    // Paths are rebuilt from the customer code so an archive from another
    // device (different sandbox path) still resolves.
    id_front_path: `${dir}/id-front.jpg`,
    id_back_path: `${dir}/id-back.jpg`,
    id_front_thumb_path: `${dir}/id-front-thumb.jpg`,
    id_back_thumb_path: `${dir}/id-back-thumb.jpg`,
    check_in_date: raw.check_in_date,
    check_out_date: raw.check_out_date ?? null,
    status: raw.status,
    created_at: raw.created_at || raw.check_in_date,
    updated_at: raw.updated_at || raw.check_in_date,
    amount_minor: normaliseAmount(raw.amount_minor),
  };
}
