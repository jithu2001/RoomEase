/**
 * Schema migrations.
 *
 * The applied version lives in SQLite's own `PRAGMA user_version`, so no extra
 * bookkeeping table is needed. Migrations are append-only: never edit a
 * released migration, add a new one.
 *
 * Each migration is a LIST OF SINGLE STATEMENTS, not one SQL script, and seed
 * rows are inserted with bound parameters. That is not a style choice: the
 * Android SQLite plugin splits a script itself and `execSQL` executes only the
 * first statement of whatever it is handed, so a script can lose statements
 * without reporting any error. Looping over single statements removes that
 * whole failure mode (and keeps values out of the SQL text).
 */

import { scalar, type SqlDriver } from './driver';
import { nowIso } from '../utils/date';
import { AppError, logError } from '../utils/errors';

export interface Migration {
  version: number;
  name: string;
  /** One SQL statement per entry. No trailing semicolons, no scripts. */
  statements: string[];
  /** Optional data seeding, run with bound parameters after the DDL. */
  seed?: (driver: SqlDriver) => Promise<void>;
}

/** Rooms created on a fresh install; editable from the Rooms screen. */
export const DEFAULT_ROOMS = ['101', '102', '103', '104', '105', '201', '202', '203'];

export const DEFAULT_SETTINGS: Record<string, string> = {
  hotel_name: 'My Hotel',
  hotel_address: '',
  hotel_phone: '',
  pin_hash: '',
  last_backup_at: '',
  // '1' = on. A database created before this key existed is treated as enabled
  // by AutoBackupService, so upgrades and fresh installs behave the same.
  auto_backup_enabled: '1',
};

export const MIGRATIONS: Migration[] = [
  {
    version: 1,
    name: 'initial schema',
    statements: [
      `CREATE TABLE IF NOT EXISTS customers (
         id INTEGER PRIMARY KEY AUTOINCREMENT,
         customer_code TEXT UNIQUE NOT NULL,
         name TEXT NOT NULL,
         address TEXT NOT NULL,
         phone TEXT NOT NULL,
         room_number TEXT NOT NULL,
         number_of_persons INTEGER NOT NULL,
         id_front_path TEXT NOT NULL,
         id_back_path TEXT NOT NULL,
         check_in_date TEXT NOT NULL,
         check_out_date TEXT,
         status TEXT NOT NULL,
         created_at TEXT NOT NULL,
         updated_at TEXT NOT NULL
       )`,
      `CREATE TABLE IF NOT EXISTS rooms (
         id INTEGER PRIMARY KEY AUTOINCREMENT,
         room_number TEXT UNIQUE NOT NULL,
         created_at TEXT NOT NULL
       )`,
      `CREATE TABLE IF NOT EXISTS settings (
         key TEXT PRIMARY KEY,
         value TEXT
       )`,
      'CREATE INDEX IF NOT EXISTS idx_customers_status ON customers (status)',
      'CREATE INDEX IF NOT EXISTS idx_customers_room ON customers (room_number)',
      'CREATE INDEX IF NOT EXISTS idx_customers_phone ON customers (phone)',
      'CREATE INDEX IF NOT EXISTS idx_customers_code ON customers (customer_code)',
      'CREATE INDEX IF NOT EXISTS idx_customers_checkin ON customers (check_in_date DESC)',
      'CREATE INDEX IF NOT EXISTS idx_customers_checkout ON customers (check_out_date DESC)',
      'CREATE INDEX IF NOT EXISTS idx_customers_name ON customers (name)',
      // Only one active guest per room — enforced by the database itself.
      `CREATE UNIQUE INDEX IF NOT EXISTS idx_customers_active_room
         ON customers (room_number) WHERE status = 'CHECKED_IN'`,
    ],
    seed: async (driver) => {
      const created = nowIso();
      for (const room of DEFAULT_ROOMS) {
        await driver.run('INSERT OR IGNORE INTO rooms (room_number, created_at) VALUES (?, ?)', [
          room,
          created,
        ]);
      }
      for (const [key, value] of Object.entries(DEFAULT_SETTINGS)) {
        await driver.run('INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)', [key, value]);
      }
      await driver.run('INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)', [
        'schema_created_at',
        created,
      ]);
    },
  },
  {
    version: 2,
    name: 'id photo thumbnails',
    statements: [
      'ALTER TABLE customers ADD COLUMN id_front_thumb_path TEXT',
      'ALTER TABLE customers ADD COLUMN id_back_thumb_path TEXT',
    ],
  },
  {
    version: 3,
    name: 'composite list indexes',
    // The customer list filters by status and orders by check-in date. With
    // separate single-column indexes SQLite had to build a temporary B-tree to
    // sort every matching row on each page load - fine at 30 records, a real
    // cost at the few thousand this schema is meant to handle. These composite
    // indexes match the ORDER BY exactly, so no sort is needed.
    statements: [
      "CREATE INDEX IF NOT EXISTS idx_customers_status_checkin ON customers (status, check_in_date DESC, id DESC)",
      "CREATE INDEX IF NOT EXISTS idx_customers_checkin_id ON customers (check_in_date DESC, id DESC)",
      // Superseded by idx_customers_checkin_id, whose leading column is the same.
      "DROP INDEX IF EXISTS idx_customers_checkin",
    ],
  },
  {
    version: 4,
    name: 'booking amount and returning-guest lookup',
    statements: [
      // Money is stored in minor units (paise) as an INTEGER. Never a float:
      // this is a record of what a guest paid.
      'ALTER TABLE customers ADD COLUMN amount_minor INTEGER',
      // Finding a returning guest means "latest stay for this phone number".
      'CREATE INDEX IF NOT EXISTS idx_customers_phone_checkin ON customers (phone, check_in_date DESC)',
      // Superseded by the composite above, whose leading column is the same.
      'DROP INDEX IF EXISTS idx_customers_phone',
    ],
  },
  {
    version: 5,
    name: 'additional guests per booking',
    // A booking is still one row in `customers` describing the primary guest.
    // The other people sharing the room are optional rows here, so a booking
    // with no companion details recorded behaves exactly as before.
    //
    // ON DELETE CASCADE means deleting a booking removes its companions; the
    // driver enables `PRAGMA foreign_keys` on every connection for this.
    statements: [
      `CREATE TABLE IF NOT EXISTS booking_guests (
         id INTEGER PRIMARY KEY AUTOINCREMENT,
         customer_id INTEGER NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
         name TEXT NOT NULL,
         phone TEXT,
         id_front_path TEXT,
         id_back_path TEXT,
         id_front_thumb_path TEXT,
         id_back_thumb_path TEXT,
         created_at TEXT NOT NULL,
         updated_at TEXT NOT NULL
       )`,
      'CREATE INDEX IF NOT EXISTS idx_booking_guests_customer ON booking_guests (customer_id)',
      // Lets the customer list find a booking by a companion's name.
      'CREATE INDEX IF NOT EXISTS idx_booking_guests_name ON booking_guests (name)',
    ],
  },
];

export const LATEST_VERSION = MIGRATIONS[MIGRATIONS.length - 1].version;

export async function getSchemaVersion(driver: SqlDriver): Promise<number> {
  return scalar<number>(driver, 'PRAGMA user_version', [], 0);
}

/**
 * Applies ONE migration atomically: DDL, then seed, then the version stamp.
 *
 * Exported so the upgrade test can bring a database to an older version and
 * then let `runMigrations` finish the job, exercising the real code path rather
 * than a copy of it.
 */
export async function applyMigration(driver: SqlDriver, migration: Migration): Promise<void> {
  await driver.transaction(async () => {
    for (const statement of migration.statements) {
      await driver.execute(statement);
    }
    await migration.seed?.(driver);
    // PRAGMA cannot be parameterised; the value is a literal from this file.
    await driver.execute(`PRAGMA user_version = ${migration.version}`);
  });
}

/**
 * Applies every migration newer than the stored `user_version`.
 * Safe to call on every app start.
 */
export async function runMigrations(driver: SqlDriver): Promise<number> {
  let current = await getSchemaVersion(driver);
  for (const migration of MIGRATIONS) {
    if (migration.version <= current) continue;
    try {
      await applyMigration(driver, migration);
      current = migration.version;
    } catch (e) {
      logError(`migration ${migration.version}`, e);
      throw new AppError(
        'DB_INIT',
        `The database could not be upgraded (step ${migration.version}: ${migration.name}).`,
        e,
      );
    }
  }
  return current;
}
