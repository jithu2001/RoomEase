/**
 * SqlDriver backed by sql.js, used by the test suite.
 *
 * This runs the *same* SQL statements the Android build runs, so migrations,
 * indexes (including the partial unique index that prevents double-booking a
 * room) and every repository query are covered by real SQLite behaviour.
 */

import { createRequire } from 'node:module';
import path from 'node:path';
import initSqlJs, { type Database } from 'sql.js';
import type { RunResult, SqlDriver, SqlValue } from '../../src/database/driver';

const require = createRequire(import.meta.url);

let statics: Awaited<ReturnType<typeof initSqlJs>> | null = null;

/** Counts `;` outside single-quoted literals. */
export function statementSeparators(sql: string): number {
  let inString = false;
  let count = 0;
  for (let i = 0; i < sql.length; i += 1) {
    const c = sql[i];
    if (c === "'") inString = !inString;
    else if (c === ';' && !inString) count += 1;
  }
  return count;
}

export function assertSingleStatement(sql: string): void {
  if (statementSeparators(sql.trim().replace(/;$/, '')) > 0) {
    throw new Error(
      'SqlDriver.execute() takes a single statement. Multi-statement scripts lose ' +
        'statements silently on Android — loop over statements instead.',
    );
  }
}

async function loadSqlJs() {
  if (statics) return statics;
  const wasmDir = path.dirname(require.resolve('sql.js/dist/sql-wasm.js'));
  statics = await initSqlJs({ locateFile: (file) => path.join(wasmDir, file) });
  return statics;
}

export class SqlJsDriver implements SqlDriver {
  private depth = 0;

  private constructor(private readonly db: Database) {}

  static async open(): Promise<SqlJsDriver> {
    const SQL = await loadSqlJs();
    const db = new SQL.Database();
    db.run('PRAGMA foreign_keys = ON;');
    return new SqlJsDriver(db);
  }

  /**
   * Single statement only, matching the production driver.
   *
   * sql.js happily runs a whole script, which is exactly why the Android
   * plugin's "only the first statement survives" behaviour was invisible to
   * these tests. Rejecting scripts here keeps the test driver honest.
   */
  async execute(sql: string): Promise<void> {
    assertSingleStatement(sql);
    this.db.exec(sql);
  }

  async run(sql: string, values: SqlValue[] = []): Promise<RunResult> {
    this.db.run(sql, values);
    const changes = this.db.getRowsModified();
    const result = this.db.exec('SELECT last_insert_rowid() AS id');
    const lastId = Number(result[0]?.values?.[0]?.[0] ?? 0);
    return { changes, lastId };
  }

  async query<T>(sql: string, values: SqlValue[] = []): Promise<T[]> {
    const stmt = this.db.prepare(sql);
    try {
      if (values.length) stmt.bind(values);
      const rows: T[] = [];
      while (stmt.step()) rows.push(stmt.getAsObject() as T);
      return rows;
    } finally {
      stmt.free();
    }
  }

  async transaction<T>(fn: () => Promise<T>): Promise<T> {
    if (this.depth > 0) return fn();
    this.depth += 1;
    this.db.run('BEGIN');
    try {
      const result = await fn();
      this.db.run('COMMIT');
      return result;
    } catch (e) {
      this.db.run('ROLLBACK');
      throw e;
    } finally {
      this.depth -= 1;
    }
  }

  async persist(): Promise<void> {
    /* in-memory */
  }

  async close(): Promise<void> {
    this.db.close();
  }
}
