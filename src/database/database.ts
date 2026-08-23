/**
 * Database bootstrap: opens the platform driver and applies migrations once.
 * Everything else in the app receives the driver through the service container.
 */

import { CapacitorSqlDriver } from './capacitorDriver';
import { runMigrations } from './migrations';
import { scalar, type SqlDriver } from './driver';
import { AppError, logError } from '../utils/errors';

let driver: SqlDriver | null = null;
let opening: Promise<SqlDriver> | null = null;

/** Opens (once) and migrates the local database. */
export async function initDatabase(): Promise<SqlDriver> {
  if (driver) return driver;
  opening ??= (async () => {
    const opened = await CapacitorSqlDriver.open();
    await assertIntegrity(opened);
    await runMigrations(opened);
    driver = opened;
    return opened;
  })();
  try {
    return await opening;
  } catch (e) {
    opening = null; // allow a retry from the start-up error screen
    throw e;
  }
}

/**
 * Fails fast on a corrupted database file.
 *
 * There is no server-side copy of this data, so silently reading a damaged file
 * is the worst outcome: it can turn a recoverable problem into lost records.
 * quick_check is cheap at this data volume (a few thousand rows).
 */
async function assertIntegrity(db: SqlDriver): Promise<void> {
  let result: string;
  try {
    result = await scalar<string>(db, 'PRAGMA quick_check(1)', [], 'ok');
  } catch (e) {
    logError('integrityCheck', e);
    return; // A pragma that cannot run is not itself evidence of corruption.
  }
  if (result.toLowerCase() === 'ok') return;
  logError('integrityCheck', new Error('quick_check reported a problem'));
  throw new AppError(
    'DB_INIT',
    'The local database file appears to be damaged. Restore your most recent backup ' +
      'from Settings on a fresh install of the app rather than continuing.',
  );
}

export function getDatabase(): SqlDriver {
  if (!driver) throw new Error('Database not initialised — call initDatabase() first.');
  return driver;
}

/**
 * Deletes every row while keeping the schema, for "Clear all data".
 * Hotel information and the app PIN are deliberately preserved.
 */
export async function wipeAllTables(db: SqlDriver = getDatabase()): Promise<void> {
  await db.transaction(async () => {
    // Cascades from customers would cover this, but being explicit keeps the
    // intent obvious and survives someone disabling foreign keys.
    await db.run('DELETE FROM booking_guests');
    await db.run('DELETE FROM customers');
    await db.run('DELETE FROM rooms');
    await db.run(
      "DELETE FROM settings WHERE key NOT IN ('hotel_name','hotel_address','hotel_phone','pin_hash')",
    );
    // sqlite_sequence only exists once an AUTOINCREMENT row has been inserted.
    const hasSequence = await db.query<{ name: string }>(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'sqlite_sequence'",
    );
    if (hasSequence.length > 0) {
      await db.run(
        "DELETE FROM sqlite_sequence WHERE name IN ('customers','rooms','booking_guests')",
      );
    }
  });
  await db.persist();
}
