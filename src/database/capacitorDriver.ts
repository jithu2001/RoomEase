/**
 * SqlDriver backed by @capacitor-community/sqlite.
 *
 * On Android this is a real native SQLite file inside the app's private data
 * directory. In the browser (`npm run dev`) the same plugin runs on top of
 * jeep-sqlite + IndexedDB, so development behaves like the device.
 */

import { CapacitorSQLite, SQLiteConnection, type SQLiteDBConnection } from '@capacitor-community/sqlite';
import { Capacitor } from '@capacitor/core';
import { AppError, logError } from '../utils/errors';
import type { RunResult, SqlDriver, SqlValue } from './driver';

export const DB_NAME = 'hotelmanager';
const DB_VERSION = 1; // plugin-level version; our own migrations use user_version.

let connectionSingleton: SQLiteConnection | null = null;

function connection(): SQLiteConnection {
  connectionSingleton ??= new SQLiteConnection(CapacitorSQLite);
  return connectionSingleton;
}

export const isNativePlatform = (): boolean => Capacitor.isNativePlatform();

/** Boots jeep-sqlite so the plugin has a web store. Native: no-op. */
async function initWebStore(): Promise<void> {
  if (isNativePlatform()) return;
  const jeep = document.querySelector('jeep-sqlite');
  if (!jeep) {
    const el = document.createElement('jeep-sqlite');
    el.setAttribute('wasmPath', '/assets');
    document.body.appendChild(el);
    await customElements.whenDefined('jeep-sqlite');
  }
  await connection().initWebStore();
}

export class CapacitorSqlDriver implements SqlDriver {
  private constructor(
    private readonly db: SQLiteDBConnection,
    private readonly web: boolean,
  ) {}

  static async open(): Promise<CapacitorSqlDriver> {
    try {
      await initWebStore();
      const conn = connection();
      // Re-use an existing JS connection when Vite hot-reloads the module.
      const existing = await conn.isConnection(DB_NAME, false);
      const db = existing.result
        ? await conn.retrieveConnection(DB_NAME, false)
        : await conn.createConnection(DB_NAME, false, 'no-encryption', DB_VERSION, false);

      const open = await db.isDBOpen();
      if (!open.result) await db.open();
      await db.execute('PRAGMA foreign_keys = ON;', false);
      return new CapacitorSqlDriver(db, !isNativePlatform());
    } catch (e) {
      logError('CapacitorSqlDriver.open', e);
      throw new AppError(
        'DB_INIT',
        'The local database could not be opened. Please restart the app.',
        e,
      );
    }
  }

  /** One statement only — see the note on SqlDriver.execute. */
  async execute(sql: string): Promise<void> {
    try {
      const inTxn = (await this.db.isTransactionActive()).result === true;
      await this.db.execute(sql, !inTxn);
      if (!inTxn) await this.persist();
    } catch (e) {
      logError('execute', e);
      throw new AppError('DB_QUERY', 'A database operation failed.', e);
    }
  }

  async run(sql: string, values: SqlValue[] = []): Promise<RunResult> {
    try {
      const inTxn = (await this.db.isTransactionActive()).result === true;
      const res = await this.db.run(sql, values, !inTxn);
      if (!inTxn) await this.persist();
      return { changes: res.changes?.changes ?? 0, lastId: res.changes?.lastId ?? 0 };
    } catch (e) {
      logError('run', e);
      throw new AppError('DB_QUERY', 'The record could not be saved.', e);
    }
  }

  async query<T>(sql: string, values: SqlValue[] = []): Promise<T[]> {
    try {
      const res = await this.db.query(sql, values);
      return (res.values ?? []) as T[];
    } catch (e) {
      logError('query', e);
      throw new AppError('DB_QUERY', 'The data could not be read from the database.', e);
    }
  }

  async transaction<T>(fn: () => Promise<T>): Promise<T> {
    if ((await this.db.isTransactionActive()).result === true) {
      // Already inside a transaction — join it rather than nesting.
      return fn();
    }
    await this.db.beginTransaction();
    try {
      const result = await fn();
      await this.db.commitTransaction();
      await this.persist();
      return result;
    } catch (e) {
      try {
        await this.db.rollbackTransaction();
      } catch (rollbackError) {
        logError('transaction.rollback', rollbackError);
      }
      throw e;
    }
  }

  async persist(): Promise<void> {
    if (!this.web) return; // native writes straight to the file
    try {
      await connection().saveToStore(DB_NAME);
    } catch (e) {
      logError('persist', e);
    }
  }

  async close(): Promise<void> {
    try {
      await this.persist();
      await this.db.close();
      await connection().closeConnection(DB_NAME, false);
    } catch (e) {
      logError('close', e);
    }
  }
}
