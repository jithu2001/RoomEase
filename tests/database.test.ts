import { describe, expect, it } from 'vitest';
import { LATEST_VERSION, getSchemaVersion, runMigrations } from '../src/database/migrations';
import { SqlJsDriver } from './helpers/sqlJsDriver';
import { buildCustomerWhere, escapeLike } from '../src/database/repositories/customerRepository';
import { formatDateTime, nightsBetween, nowIso, toDayKey, toIso, dayKeyOf } from '../src/utils/date';

describe('migrations', () => {
  it('brings an empty database up to the latest version', async () => {
    const db = await SqlJsDriver.open();
    try {
      expect(await getSchemaVersion(db)).toBe(0);
      expect(await runMigrations(db)).toBe(LATEST_VERSION);
      expect(await getSchemaVersion(db)).toBe(LATEST_VERSION);
    } finally {
      await db.close();
    }
  });

  it('is idempotent when run again on every app start', async () => {
    const db = await SqlJsDriver.open();
    try {
      await runMigrations(db);
      await runMigrations(db);
      await runMigrations(db);
      const rooms = await db.query<{ c: number }>('SELECT COUNT(*) AS c FROM rooms');
      expect(rooms[0].c).toBe(8);
    } finally {
      await db.close();
    }
  });

  it('creates the expected tables and customer columns', async () => {
    const db = await SqlJsDriver.open();
    try {
      await runMigrations(db);
      const tables = await db.query<{ name: string }>(
        "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
      );
      expect(tables.map((t) => t.name)).toEqual([
        'booking_guests',
        'customers',
        'rooms',
        'settings',
      ]);

      const columns = await db.query<{ name: string }>('PRAGMA table_info(customers)');
      expect(columns.map((c) => c.name)).toEqual([
        'id', 'customer_code', 'name', 'address', 'phone', 'room_number',
        'number_of_persons', 'id_front_path', 'id_back_path', 'check_in_date',
        'check_out_date', 'status', 'created_at', 'updated_at',
        'id_front_thumb_path', 'id_back_thumb_path', 'amount_minor',
      ]);
    } finally {
      await db.close();
    }
  });

  it('indexes the columns the customer list searches on', async () => {
    const db = await SqlJsDriver.open();
    try {
      await runMigrations(db);
      const indexes = await db.query<{ name: string }>(
        "SELECT name FROM sqlite_master WHERE type = 'index' AND tbl_name = 'customers'",
      );
      const names = indexes.map((i) => i.name);
      for (const expected of [
        'idx_customers_status',
        'idx_customers_room',
        'idx_customers_phone_checkin',
        'idx_customers_code',
        'idx_customers_checkin_id',
        'idx_customers_status_checkin',
        'idx_customers_active_room',
      ]) {
        expect(names).toContain(expected);
      }
    } finally {
      await db.close();
    }
  });

  it('enforces one active guest per room at the database level', async () => {
    const db = await SqlJsDriver.open();
    try {
      await runMigrations(db);
      const insert = (code: string, status: string) =>
        db.run(
          `INSERT INTO customers (customer_code, name, address, phone, room_number,
             number_of_persons, id_front_path, id_back_path, check_in_date, status,
             created_at, updated_at)
           VALUES (?, 'X', 'Y', '1', '101', 1, 'a', 'b', '2026-08-18T10:00:00.000+05:30', ?, 'n', 'n')`,
          [code, status],
        );
      await insert('CUS-000001', 'CHECKED_IN');
      await expect(insert('CUS-000002', 'CHECKED_IN')).rejects.toThrow();
      // Checked-out history in the same room is fine.
      await expect(insert('CUS-000003', 'CHECKED_OUT')).resolves.toBeTruthy();
      await expect(insert('CUS-000004', 'CHECKED_OUT')).resolves.toBeTruthy();
    } finally {
      await db.close();
    }
  });

  it('rejects a duplicate customer code', async () => {
    const db = await SqlJsDriver.open();
    try {
      await runMigrations(db);
      await db.run("INSERT INTO rooms (room_number, created_at) VALUES ('999', 'n')");
      await expect(
        db.run("INSERT INTO rooms (room_number, created_at) VALUES ('999', 'n')"),
      ).rejects.toThrow();
    } finally {
      await db.close();
    }
  });

  // Migration structure and seeding are asserted in migrationSql.test.ts.
});

describe('search sql', () => {
  it('escapes LIKE wildcards', () => {
    expect(escapeLike('50%')).toBe('50\\%');
    expect(escapeLike('a_b')).toBe('a\\_b');
    expect(escapeLike('back\\slash')).toBe('back\\\\slash');
  });

  it('builds no WHERE clause for an unfiltered list', () => {
    expect(buildCustomerWhere({})).toEqual({ sql: '', values: [] });
    expect(buildCustomerWhere({ filter: 'ALL' })).toEqual({ sql: '', values: [] });
  });

  it('binds one parameter per searchable column', () => {
    const where = buildCustomerWhere({ search: 'nair', filter: 'CHECKED_IN' });
    // name, phone, room, code, plus the additional-guest name subquery.
    expect(where.values).toEqual([
      'CHECKED_IN',
      '%nair%',
      '%nair%',
      '%nair%',
      '%nair%',
      '%nair%',
    ]);
    expect(where.sql.startsWith('WHERE')).toBe(true);
  });
});

describe('timestamps', () => {
  it('writes ISO 8601 with the device offset', () => {
    expect(nowIso()).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}[+-]\d{2}:\d{2}$/);
  });

  it('round-trips through Date', () => {
    const date = new Date(2026, 7, 18, 10, 35, 12, 500);
    const iso = toIso(date);
    expect(iso.startsWith('2026-08-18T10:35:12.500')).toBe(true);
    expect(new Date(iso).getTime()).toBe(date.getTime());
  });

  it('exposes the local day as a sortable prefix', () => {
    const date = new Date(2026, 7, 18, 23, 50);
    expect(dayKeyOf(toIso(date))).toBe('2026-08-18');
    expect(toDayKey(date)).toBe('2026-08-18');
  });

  it('formats for staff as 18 Aug 2026, 10:35 AM', () => {
    expect(formatDateTime(toIso(new Date(2026, 7, 18, 10, 35)))).toBe('18 Aug 2026, 10:35 AM');
    expect(formatDateTime(toIso(new Date(2026, 7, 18, 0, 5)))).toBe('18 Aug 2026, 12:05 AM');
    expect(formatDateTime(toIso(new Date(2026, 7, 18, 12, 0)))).toBe('18 Aug 2026, 12:00 PM');
    expect(formatDateTime(toIso(new Date(2026, 7, 18, 21, 7)))).toBe('18 Aug 2026, 9:07 PM');
  });

  it('shows a dash instead of crashing on missing or bad values', () => {
    expect(formatDateTime(null)).toBe('—');
    expect(formatDateTime('')).toBe('—');
    expect(formatDateTime('not a date')).toBe('—');
  });

  it('counts nights stayed', () => {
    const from = toIso(new Date(2026, 7, 14, 10, 0));
    const to = toIso(new Date(2026, 7, 18, 11, 0));
    expect(nightsBetween(from, to)).toBe(4);
    expect(nightsBetween(to, from)).toBe(0);
  });
});
