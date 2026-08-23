/**
 * Guards migrations against the Android SQLite plugin's script handling.
 *
 * @capacitor-community/sqlite splits a multi-statement script itself
 * (`UtilsSQLite.getStatementsArray`, which splits on the literal `";\n"`) and
 * Android's `SQLiteDatabase.execSQL()` then executes only the FIRST statement of
 * whatever string it receives. A script can therefore lose statements while the
 * plugin still reports success — which is exactly what happened on device: the
 * room seed silently ended up with 3 of 8 rooms.
 *
 * sql.js executes every statement in a script, so unit tests could never see
 * this. The defence is structural — migrations are lists of single statements
 * and seeds use bound parameters — and these tests hold that structure in place.
 */

import { describe, expect, it } from 'vitest';
import { MIGRATIONS, DEFAULT_ROOMS, DEFAULT_SETTINGS, runMigrations } from '../src/database/migrations';
import { SqlJsDriver, statementSeparators } from './helpers/sqlJsDriver';

/** Faithful port of UtilsSQLite.getStatementsArray() (Android). */
function getStatementsArray(statements: string): string[] {
  const stmts = statements.split('end;').join('END;');
  const parts = stmts.split(';\n');
  // Java's String.split discards trailing empty strings.
  while (parts.length > 0 && parts[parts.length - 1] === '') parts.pop();

  const flattened = parts.map((part) =>
    part
      .split('\n')
      .map((line) => {
        const trimmed = line.trim();
        const comment = trimmed.indexOf('--');
        return comment > -1 ? trimmed.slice(0, comment) : trimmed;
      })
      .filter((line) => line.length > 0)
      .join(' '),
  );
  if (flattened.length > 0 && flattened[flattened.length - 1].trim().length === 0) flattened.pop();
  return flattened;
}

describe('migration structure', () => {
  it('has strictly increasing, unique versions', () => {
    const versions = MIGRATIONS.map((m) => m.version);
    expect(versions).toEqual([...versions].sort((a, b) => a - b));
    expect(new Set(versions).size).toBe(versions.length);
  });

  for (const migration of MIGRATIONS) {
    describe(`migration ${migration.version} (${migration.name})`, () => {
      it('contains one statement per entry', () => {
        expect(migration.statements.length).toBeGreaterThan(0);
        for (const statement of migration.statements) {
          expect(statement.trim().length).toBeGreaterThan(0);
          // A `;` here would mean a second statement Android would drop.
          expect(statementSeparators(statement)).toBe(0);
        }
      });

      it('survives the Android plugin splitter unchanged', () => {
        for (const statement of migration.statements) {
          // One statement in, one statement out, nothing lost.
          expect(getStatementsArray(`${statement};\n`)).toHaveLength(1);
        }
      });

      it('embeds no literal values in DDL', () => {
        for (const statement of migration.statements) {
          // The only quoted literal we allow is the partial-index predicate.
          const quoted = statement.match(/'[^']*'/g) ?? [];
          for (const literal of quoted) {
            expect(literal).toBe("'CHECKED_IN'");
          }
        }
      });
    });
  }
});

describe('seeding', () => {
  it('inserts every default room and setting', async () => {
    const db = await SqlJsDriver.open();
    try {
      await runMigrations(db);

      const rooms = await db.query<{ room_number: string }>(
        'SELECT room_number FROM rooms ORDER BY id',
      );
      expect(rooms.map((r) => r.room_number)).toEqual(DEFAULT_ROOMS);

      const settings = await db.query<{ key: string }>('SELECT key FROM settings ORDER BY key');
      for (const key of Object.keys(DEFAULT_SETTINGS)) {
        expect(settings.map((s) => s.key)).toContain(key);
      }

      // AUTOINCREMENT high-water mark must match the row count: a mismatch means
      // inserts were attempted and rejected, the symptom seen on device.
      const seq = await db.query<{ seq: number }>(
        "SELECT seq FROM sqlite_sequence WHERE name = 'rooms'",
      );
      expect(seq[0]?.seq).toBe(DEFAULT_ROOMS.length);
    } finally {
      await db.close();
    }
  });

  it('does not duplicate rooms when migrations re-run', async () => {
    const db = await SqlJsDriver.open();
    try {
      await runMigrations(db);
      await runMigrations(db);
      const count = await db.query<{ c: number }>('SELECT COUNT(*) AS c FROM rooms');
      expect(count[0].c).toBe(DEFAULT_ROOMS.length);
    } finally {
      await db.close();
    }
  });
});

describe('driver contract', () => {
  it('rejects multi-statement scripts so the bug cannot come back', async () => {
    const db = await SqlJsDriver.open();
    try {
      await expect(
        db.execute('CREATE TABLE a (x INTEGER); CREATE TABLE b (y INTEGER)'),
      ).rejects.toThrow(/single statement/i);
    } finally {
      await db.close();
    }
  });
});
