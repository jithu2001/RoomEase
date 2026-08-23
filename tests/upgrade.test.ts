/**
 * Upgrading a database that already contains bookings.
 *
 * Every other test starts from an empty database, which does not answer the
 * question that actually matters once the app is in use: *does an update keep
 * the data that is already on the phone?*
 *
 * These tests build a database at the schema version a previous release shipped,
 * fill it with realistic records and photos, then run the current migrations and
 * assert that nothing was lost, changed or corrupted — and that the new features
 * work on top of the old data.
 */

import { describe, expect, it } from 'vitest';
import {
  LATEST_VERSION,
  MIGRATIONS,
  applyMigration,
  getSchemaVersion,
  runMigrations,
} from '../src/database/migrations';
import { createServices } from '../src/services/container';
import { MemoryFileStore } from '../src/services/fileStore';
import { CUSTOMER_STATUS } from '../src/types';
import { fakeImage, formValues } from './helpers/testEnv';
import { SqlJsDriver } from './helpers/sqlJsDriver';
import { isoToLocalInput } from '../src/utils/date';

/** The schema version shipped by v1.0.0, the build now running on the phone. */
const SHIPPED_VERSION = 3;

interface OldRecord {
  code: string;
  name: string;
  phone: string;
  room: string;
  persons: number;
  checkIn: string;
  checkOut: string | null;
  status: string;
}

const EXISTING: OldRecord[] = [
  {
    code: 'CUS-000001',
    name: 'Anoob Suresh',
    phone: '9847012345',
    room: '101',
    persons: 2,
    checkIn: '2026-08-19T10:35:42.000+05:30',
    checkOut: '2026-08-21T09:12:07.000+05:30',
    status: CUSTOMER_STATUS.CHECKED_OUT,
  },
  {
    code: 'CUS-000002',
    name: 'Meera Nair',
    phone: '9000011111',
    room: '102',
    persons: 3,
    checkIn: '2026-08-22T18:04:19.000+05:30',
    checkOut: null,
    status: CUSTOMER_STATUS.CHECKED_IN,
  },
  {
    code: 'CUS-000003',
    name: 'Rahul Menon',
    phone: '9812345678',
    room: '203',
    persons: 1,
    checkIn: '2026-08-23T07:55:03.000+05:30',
    checkOut: null,
    status: CUSTOMER_STATUS.CHECKED_IN,
  },
];

/**
 * Builds a database exactly as v1.0.0 left it: migrations 1..3 applied, real
 * bookings inserted, ID photos on disk. Deliberately does NOT reference any
 * column added later.
 */
async function buildOldDatabase() {
  const db = await SqlJsDriver.open();
  const files = new MemoryFileStore();

  for (const migration of MIGRATIONS) {
    if (migration.version > SHIPPED_VERSION) break;
    await applyMigration(db, migration);
  }
  expect(await getSchemaVersion(db)).toBe(SHIPPED_VERSION);

  for (const record of EXISTING) {
    const dir = `hotel-data/customers/${record.code}`;
    await db.run(
      `INSERT INTO customers (
         customer_code, name, address, phone, room_number, number_of_persons,
         id_front_path, id_back_path, id_front_thumb_path, id_back_thumb_path,
         check_in_date, check_out_date, status, created_at, updated_at
       ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [
        record.code,
        record.name,
        `${record.room} Beach Road, Kochi`,
        record.phone,
        record.room,
        record.persons,
        `${dir}/id-front.jpg`,
        `${dir}/id-back.jpg`,
        `${dir}/id-front-thumb.jpg`,
        `${dir}/id-back-thumb.jpg`,
        record.checkIn,
        record.checkOut,
        record.status,
        record.checkIn,
        record.checkIn,
      ],
    );
    for (const name of ['id-front', 'id-back', 'id-front-thumb', 'id-back-thumb']) {
      await files.write(`${dir}/${name}.jpg`, fakeImage(`${record.code}-${name}`).full);
    }
  }

  // The seed already created this key; the hotel renamed itself afterwards.
  await db.run("UPDATE settings SET value = 'Trinity Residency' WHERE key = 'hotel_name'");
  return { db, files };
}

describe('updating an app that already holds real data', () => {
  it('brings the schema forward and keeps every booking byte-for-byte', async () => {
    const { db, files } = await buildOldDatabase();
    try {
      const before = await db.query<Record<string, unknown>>(
        'SELECT * FROM customers ORDER BY id',
      );
      expect(before).toHaveLength(3);

      expect(await runMigrations(db)).toBe(LATEST_VERSION);

      const after = await db.query<Record<string, unknown>>('SELECT * FROM customers ORDER BY id');
      expect(after).toHaveLength(3);

      // Every column that existed before still holds exactly the same value.
      after.forEach((row, index) => {
        for (const key of Object.keys(before[index])) {
          expect(row[key]).toEqual(before[index][key]);
        }
      });

      // Including the seconds in the original timestamps.
      expect(after[0].check_in_date).toBe('2026-08-19T10:35:42.000+05:30');
      expect(after[0].check_out_date).toBe('2026-08-21T09:12:07.000+05:30');

      // The photo files are untouched.
      expect(files.files.size).toBe(12);
      expect(await files.exists('hotel-data/customers/CUS-000002/id-front.jpg')).toBe(true);
    } finally {
      await db.close();
    }
  });

  it('adds the new columns and tables as empty, not as guesses', async () => {
    const { db } = await buildOldDatabase();
    try {
      await runMigrations(db);

      // Amount is "not recorded" for pre-existing bookings, not zero.
      const rows = await db.query<{ amount_minor: number | null }>(
        'SELECT amount_minor FROM customers ORDER BY id',
      );
      expect(rows.map((r) => r.amount_minor)).toEqual([null, null, null]);

      // No phantom companions invented for a 3-person booking.
      const guests = await db.query<{ c: number }>('SELECT COUNT(*) AS c FROM booking_guests');
      expect(guests[0].c).toBe(0);
    } finally {
      await db.close();
    }
  });

  it('leaves the existing rooms and hotel settings alone', async () => {
    const { db } = await buildOldDatabase();
    try {
      await runMigrations(db);
      const rooms = await db.query<{ room_number: string }>(
        'SELECT room_number FROM rooms ORDER BY id',
      );
      expect(rooms.map((r) => r.room_number)).toEqual([
        '101', '102', '103', '104', '105', '201', '202', '203',
      ]);
      const name = await db.query<{ value: string }>(
        "SELECT value FROM settings WHERE key = 'hotel_name'",
      );
      expect(name[0].value).toBe('Trinity Residency');
    } finally {
      await db.close();
    }
  });

  it('is safe to run twice, as a reinstall would', async () => {
    const { db } = await buildOldDatabase();
    try {
      await runMigrations(db);
      await runMigrations(db);
      await runMigrations(db);
      expect(await getSchemaVersion(db)).toBe(LATEST_VERSION);
      const count = await db.query<{ c: number }>('SELECT COUNT(*) AS c FROM customers');
      expect(count[0].c).toBe(3);
    } finally {
      await db.close();
    }
  });
});

describe('the app on top of upgraded data', () => {
  async function upgraded() {
    const { db, files } = await buildOldDatabase();
    await runMigrations(db);
    return { db, files, services: createServices(db, files) };
  }

  it('reads the old bookings through every screen query', async () => {
    const { db, services } = await upgraded();
    try {
      const page = await services.customers.search();
      expect(page.total).toBe(3);
      // Newest check-in first, as the list always ordered.
      expect(page.items.map((c) => c.customer_code)).toEqual([
        'CUS-000003',
        'CUS-000002',
        'CUS-000001',
      ]);

      const stats = await services.customers.dashboard();
      expect(stats).toMatchObject({
        currently_staying: 2,
        active_guests: 4,
        occupied_rooms: 2,
        total_rooms: 8,
        available_rooms: 6,
      });

      // Occupancy still blocks the rooms those guests are in.
      const available = await services.rooms.listAvailable();
      expect(available).not.toContain('102');
      expect(available).not.toContain('203');
      expect(available).toContain('101');
    } finally {
      await db.close();
    }
  });

  it('finds an old guest as a returning guest, photos included', async () => {
    const { db, services } = await upgraded();
    try {
      const matches = await services.customers.findReturningGuests('9847012345');
      expect(matches).toHaveLength(1);
      expect(matches[0]).toMatchObject({ name: 'Anoob Suresh', has_id_photos: true });

      // And a repeat booking copies those existing photos forward.
      const repeat = await services.customers.checkIn(
        formValues({ room_number: '104', check_in_at: '2026-08-23T12:00' }),
        { reuseFromCustomerId: matches[0].customer_id },
      );
      expect(repeat.customer_code).toBe('CUS-000004');
      expect(repeat.name).toBe('Anoob Suresh');
    } finally {
      await db.close();
    }
  });

  it('lets an amount and a companion be added to an old booking', async () => {
    const { db, services } = await upgraded();
    try {
      const meera = (await services.customers.search({ search: 'CUS-000002' })).items[0];

      // Amount on a booking that predates the column.
      const priced = await services.customers.update(
        meera.id,
        formValues({
          name: meera.name,
          address: meera.address,
          phone: meera.phone,
          room_number: meera.room_number,
          number_of_persons: meera.number_of_persons,
          amount: '2500',
          check_in_at: isoToLocalInput(meera.check_in_date),
        }),
      );
      expect(priced.amount_minor).toBe(250000);

      // Companions on a booking made before the table existed.
      const guest = await services.guests.add(
        meera.id,
        { name: 'Companion One', phone: '' },
        { front: fakeImage('companion') },
      );
      expect(guest.customer_id).toBe(meera.id);
      expect(await services.guests.capacity(meera.id)).toMatchObject({
        persons: 3,
        recorded: 1,
        allowed: 2,
      });
      expect((await services.customers.search({ search: 'Companion One' })).total).toBe(1);
    } finally {
      await db.close();
    }
  });

  it('can still back up and restore the upgraded data', async () => {
    const { db, services } = await upgraded();
    try {
      const { bytes, manifest, warnings } = await services.backup.buildArchive();
      expect(manifest.counts.customers).toBe(3);
      expect(manifest.schema_version).toBe(LATEST_VERSION);
      expect(warnings).toEqual([]);

      const freshDb = await SqlJsDriver.open();
      const freshFiles = new MemoryFileStore();
      try {
        await runMigrations(freshDb);
        const fresh = createServices(freshDb, freshFiles);
        const summary = await fresh.backup.restoreBackup(bytes);
        expect(summary.customers).toBe(3);
        expect(summary.warnings).toEqual([]);
        expect((await fresh.customers.search()).total).toBe(3);
      } finally {
        await freshDb.close();
      }
    } finally {
      await db.close();
    }
  });

  it('keeps an old timestamp intact unless the form deliberately changes it', async () => {
    const { db, services } = await upgraded();
    try {
      const rahul = (await services.customers.search({ search: 'CUS-000003' })).items[0];
      expect(rahul.check_in_date).toBe('2026-08-23T07:55:03.000+05:30');

      // Editing submits the time the form displays, which is minute-precision:
      // the seconds in a pre-existing timestamp are dropped on first edit.
      const edited = await services.customers.update(
        rahul.id,
        formValues({
          name: rahul.name,
          address: rahul.address,
          phone: rahul.phone,
          room_number: rahul.room_number,
          number_of_persons: rahul.number_of_persons,
          check_in_at: isoToLocalInput(rahul.check_in_date),
        }),
      );
      expect(edited.check_in_date).toBe('2026-08-23T07:55:00.000+05:30');
      // The date and time a person would read are unchanged.
      expect(isoToLocalInput(edited.check_in_date)).toBe('2026-08-23T07:55');
    } finally {
      await db.close();
    }
  });
});
