/**
 * The single SQL seam of the app.
 *
 * Repositories talk to this interface only, which keeps the real SQL identical
 * between the Android/browser Capacitor driver and the sql.js driver used by
 * the test suite.
 */

export type SqlValue = string | number | null;

export interface RunResult {
  changes: number;
  lastId: number;
}

export interface SqlDriver {
  /**
   * Runs exactly ONE statement (DDL or PRAGMA).
   *
   * Multi-statement scripts are deliberately not supported: the Android SQLite
   * plugin splits scripts itself and `execSQL` then runs only the first
   * statement of whatever it receives, silently dropping the rest while still
   * reporting success. Callers loop instead — see `runMigrations`.
   */
  execute(sql: string): Promise<void>;
  /** Runs a single INSERT/UPDATE/DELETE. */
  run(sql: string, values?: SqlValue[]): Promise<RunResult>;
  /** Runs a SELECT and returns the rows. */
  query<T = Record<string, unknown>>(sql: string, values?: SqlValue[]): Promise<T[]>;
  /** Runs `fn` in a transaction, rolling back if it throws. */
  transaction<T>(fn: () => Promise<T>): Promise<T>;
  /** Flushes to durable storage (a no-op on native, saves the web store). */
  persist(): Promise<void>;
  close(): Promise<void>;
}

/** Reads the single scalar of a `SELECT <expr>` style query. */
export async function scalar<T extends SqlValue>(
  driver: SqlDriver,
  sql: string,
  values: SqlValue[] = [],
  fallback: T,
): Promise<T> {
  const rows = await driver.query<Record<string, T>>(sql, values);
  const first = rows[0];
  if (!first) return fallback;
  const value = Object.values(first)[0];
  return value === null || value === undefined ? fallback : value;
}
