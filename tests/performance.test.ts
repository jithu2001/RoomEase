/**
 * Scale checks.
 *
 * The hotel expects ~30 bookings a month, but the spec requires the schema to
 * stay usable at 5,000+ customer records without being rebuilt. Wall-clock
 * numbers vary by machine, so the load-bearing assertions here are on SQLite's
 * *query plans*: a plan that falls back to a temporary B-tree sort or a table
 * scan is a scalability bug regardless of how fast this particular laptop is.
 */

import { beforeAll, afterAll, describe, expect, it } from 'vitest';
import { createTestEnv, type TestEnv } from './helpers/testEnv';
import { CUSTOMER_STATUS } from '../src/types';

const TOTAL = 5000;
/** Rooms are unique per active guest, so most history is checked out. */
const ACTIVE = 8;
const CHUNK = 200;

let env: TestEnv;

async function plan(sql: string, params: (string | number)[] = []): Promise<string> {
  const rows = await env.db.query<{ detail: string }>(`EXPLAIN QUERY PLAN ${sql}`, params);
  return rows.map((r) => r.detail).join(' | ');
}

beforeAll(async () => {
  env = await createTestEnv();

  const columns =
    'customer_code, name, address, phone, room_number, number_of_persons, ' +
    'id_front_path, id_back_path, check_in_date, check_out_date, status, created_at, updated_at';
  const tuple = '(?,?,?,?,?,?,?,?,?,?,?,?,?)';

  await env.db.transaction(async () => {
    for (let start = 0; start < TOTAL; start += CHUNK) {
      const values: (string | number | null)[] = [];
      const tuples: string[] = [];
      for (let i = start; i < Math.min(start + CHUNK, TOTAL); i += 1) {
        const n = i + 1;
        const active = n <= ACTIVE;
        // Spread check-ins across ~3 years of history.
        const day = String((n % 28) + 1).padStart(2, '0');
        const month = String((n % 12) + 1).padStart(2, '0');
        const year = 2024 + (n % 3);
        const checkIn = `${year}-${month}-${day}T10:${String(n % 60).padStart(2, '0')}:00.000+05:30`;
        tuples.push(tuple);
        values.push(
          `CUS-${String(n).padStart(6, '0')}`,
          `Guest Number ${n}`,
          `${n} Beach Road, Kochi`,
          `98470${String(n).padStart(5, '0')}`,
          active ? `10${n}` : `2${String(n % 40).padStart(2, '0')}`,
          (n % 4) + 1,
          `hotel-data/customers/CUS-${String(n).padStart(6, '0')}/id-front.jpg`,
          `hotel-data/customers/CUS-${String(n).padStart(6, '0')}/id-back.jpg`,
          checkIn,
          active ? null : checkIn,
          active ? CUSTOMER_STATUS.CHECKED_IN : CUSTOMER_STATUS.CHECKED_OUT,
          checkIn,
          checkIn,
        );
      }
      await env.db.run(
        `INSERT INTO customers (${columns}) VALUES ${tuples.join(',')}`,
        values as (string | number)[],
      );
    }
  });
}, 120_000);

afterAll(async () => {
  await env.close();
});

describe(`with ${TOTAL} customer records`, () => {
  it('loaded the whole data set', async () => {
    const page = await env.customers.search({ limit: 1 });
    expect(page.total).toBe(TOTAL);
  });

  it('serves the first page without sorting the table', async () => {
    const detail = await plan(
      'SELECT id FROM customers ORDER BY check_in_date DESC, id DESC LIMIT 25 OFFSET 0',
    );
    expect(detail).toContain('idx_customers_checkin_id');
    expect(detail).not.toContain('TEMP B-TREE');
  });

  it('serves a status-filtered page without sorting the table', async () => {
    const detail = await plan(
      'SELECT id FROM customers WHERE status = ? ORDER BY check_in_date DESC, id DESC LIMIT 25',
      [CUSTOMER_STATUS.CHECKED_OUT],
    );
    expect(detail).toContain('idx_customers_status_checkin');
    expect(detail).not.toContain('TEMP B-TREE');
  });

  it('looks up a customer code and an occupied room by index', async () => {
    expect(await plan('SELECT id FROM customers WHERE customer_code = ?', ['CUS-000001'])).toContain(
      'SEARCH',
    );
    const roomPlan = await plan('SELECT id FROM customers WHERE room_number = ? AND status = ?', [
      '101',
      CUSTOMER_STATUS.CHECKED_IN,
    ]);
    expect(roomPlan).toContain('SEARCH');
    expect(roomPlan).not.toContain('TEMP B-TREE');
  });

  it('counts by status using an index rather than a scan', async () => {
    const detail = await plan('SELECT COUNT(*) AS c FROM customers WHERE status = ?', [
      CUSTOMER_STATUS.CHECKED_IN,
    ]);
    expect(detail).toContain('idx_customers_status');
    expect(detail).not.toContain('SCAN customers');
  });

  it('renders a list page quickly', async () => {
    const started = performance.now();
    const page = await env.customers.search({ limit: 25 });
    const elapsed = performance.now() - started;

    expect(page.items).toHaveLength(25);
    expect(elapsed).toBeLessThan(500);
  });

  it('pages deep into history quickly', async () => {
    const started = performance.now();
    const page = await env.customers.search({ limit: 25, offset: 4000 });
    expect(page.items).toHaveLength(25);
    expect(performance.now() - started).toBeLessThan(500);
  });

  it('searches by phone quickly', async () => {
    const started = performance.now();
    const page = await env.customers.search({ search: '9847004321' });
    const elapsed = performance.now() - started;

    expect(page.total).toBe(1);
    expect(elapsed).toBeLessThan(750);
  });

  it('builds the dashboard quickly', async () => {
    const started = performance.now();
    const stats = await env.customers.dashboard();
    const elapsed = performance.now() - started;

    expect(stats.currently_staying).toBe(ACTIVE);
    expect(elapsed).toBeLessThan(1000);
  });

  it('keeps search fast with the additional-guest subquery', async () => {
    // Every booking gets a companion, so the EXISTS subquery has real work.
    await env.db.transaction(async () => {
      for (let i = 1; i <= 400; i += 1) {
        await env.db.run(
          'INSERT INTO booking_guests (customer_id, name, phone, created_at, updated_at) VALUES (?,?,?,?,?)',
          [i, 'Companion Number ' + i, null, 'n', 'n'],
        );
      }
    });

    // A term that only a companion matches must still find the booking.
    const started = performance.now();
    const page = await env.customers.search({ search: 'Companion Number 321' });
    const elapsed = performance.now() - started;

    expect(page.total).toBe(1);
    expect(page.items[0].id).toBe(321);
    expect(elapsed).toBeLessThan(1500);

    // And the ordinary primary-guest search is still quick alongside it.
    const started2 = performance.now();
    const byPhone = await env.customers.search({ search: '9847004321' });
    expect(byPhone.total).toBe(1);
    expect(performance.now() - started2).toBeLessThan(1500);

    // The companion lookup itself is index-backed.
    const detail = await plan(
      'SELECT 1 FROM booking_guests g WHERE g.customer_id = ? AND g.name LIKE ?',
      [1, '%x%'],
    );
    expect(detail).toContain('idx_booking_guests_customer');
  });

  it('looks up a returning guest quickly', async () => {
    const started = performance.now();
    const matches = await env.customers.findReturningGuests('9847004321');
    const elapsed = performance.now() - started;

    expect(matches).toHaveLength(1);
    expect(matches[0].stay_count).toBe(1);
    // The lookup runs while a staff member is typing, so it has to stay snappy
    // even though a partial-phone search cannot use an index.
    expect(elapsed).toBeLessThan(1000);
  });

  it('builds a day report quickly despite scanning on a date expression', async () => {
    // "Staying on this date" compares substr(check_in_date,1,10), which no index
    // can serve. That is acceptable because a report is a deliberate one-off
    // action, but it still must not feel broken at this data volume.
    const started = performance.now();
    const report = await env.reports.buildDayReport('2025-06-15');
    const elapsed = performance.now() - started;

    expect(report.day_label).toBe('15 Jun 2025');
    expect(elapsed).toBeLessThan(1500);

    // A report on a day with no guests is just as quick.
    const started2 = performance.now();
    const empty = await env.reports.buildDayReport('2019-01-01');
    expect(empty.bookings).toEqual([]);
    expect(performance.now() - started2).toBeLessThan(1500);
  });

  it('keeps the filtered list correct as well as fast', async () => {
    const staying = await env.customers.search({ filter: 'CHECKED_IN', limit: 50 });
    expect(staying.total).toBe(ACTIVE);
    const out = await env.customers.search({ filter: 'CHECKED_OUT', limit: 1 });
    expect(out.total).toBe(TOTAL - ACTIVE);
  });
});
