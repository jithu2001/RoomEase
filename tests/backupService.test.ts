import { beforeEach, afterEach, describe, expect, it } from 'vitest';
import { zipSync } from 'fflate';
import { createTestEnv, formValues, idImages, type TestEnv } from './helpers/testEnv';
import { utf8ToBytes } from '../src/utils/base64';
import { BACKUP_FORMAT } from '../src/services/backupService';
import { LATEST_VERSION } from '../src/database/migrations';
import { CUSTOMER_STATUS } from '../src/types';

let env: TestEnv;

beforeEach(async () => {
  env = await createTestEnv();
});

afterEach(async () => {
  await env.close();
});

async function seed() {
  const a = await env.customers.checkIn(formValues({ room_number: '101' }), idImages());
  const b = await env.customers.checkIn(
    formValues({ name: 'Meera Nair', phone: '9000011111', room_number: '102' }),
    idImages(),
  );
  await env.customers.checkOut(b.id);
  await env.settings.saveHotelInfo({
    hotel_name: 'Trinity Residency',
    hotel_address: 'Fort Kochi',
    hotel_phone: '04842222333',
  });
  await env.settings.setPin('4321');
  return { a, b };
}

describe('backup export', () => {
  it('creates an archive with the manifest, data and images', async () => {
    await seed();
    const result = await env.backup.exportBackup();

    expect(result.fileName).toMatch(/^hotel-backup-\d{4}-\d{2}-\d{2}-\d{4}\.zip$/);
    expect(result.customers).toBe(2);
    expect(result.images).toBe(8); // 2 customers x (front, back, 2 thumbs)
    expect(result.warnings).toEqual([]);
    expect(result.bytes).toBeGreaterThan(0);
    expect(env.files.shared.has(result.path)).toBe(true);
    expect(result.path).toBe(`backups/${result.fileName}`);

    const { manifest, payload } = await env.backup.inspect(env.files.shared.get(result.path)!);
    expect(manifest.format).toBe(BACKUP_FORMAT);
    expect(manifest.schema_version).toBe(LATEST_VERSION);
    expect(payload.customers).toHaveLength(2);
    expect(payload.rooms).toHaveLength(8);
    expect(payload.settings.hotel_name).toBe('Trinity Residency');
  });

  it('never puts the app PIN in the backup', async () => {
    await seed();
    const { bytes } = await env.backup.buildArchive();
    const { payload } = await env.backup.inspect(bytes);
    expect(payload.settings.pin_hash).toBeUndefined();
  });

  it('records the last backup time', async () => {
    await seed();
    expect(await env.settings.lastBackupAt()).toBe('');
    await env.backup.exportBackup();
    expect(await env.settings.lastBackupAt()).not.toBe('');
  });

  it('can export data without images', async () => {
    await seed();
    const result = await env.backup.exportBackup(false);
    expect(result.fileName).toContain('-data-only');
    expect(result.images).toBe(0);
  });

  it('warns about missing image files instead of failing', async () => {
    const customer = await env.customers.checkIn(formValues(), idImages());
    await env.files.remove(customer.id_front_path);

    const { warnings, manifest } = await env.backup.buildArchive();
    expect(manifest.counts.images).toBe(3);
    expect(warnings.join(' ')).toContain('id-front.jpg is missing');
  });
});

describe('backup restore', () => {
  it('restores customers, rooms, settings and photos onto an empty device', async () => {
    await seed();
    const archive = (await env.backup.buildArchive()).bytes;

    const fresh = await createTestEnv();
    try {
      const summary = await fresh.backup.restoreBackup(archive);

      expect(summary.customers).toBe(2);
      expect(summary.images).toBe(8);
      expect(summary.warnings).toEqual([]);

      const page = await fresh.customers.search();
      expect(page.total).toBe(2);
      const restored = await fresh.customers.search({ search: 'CUS-000001' });
      expect(restored.items[0]).toMatchObject({
        customer_code: 'CUS-000001',
        room_number: '101',
        status: CUSTOMER_STATUS.CHECKED_IN,
      });
      expect(await fresh.files.exists('hotel-data/customers/CUS-000001/id-front.jpg')).toBe(true);
      expect((await fresh.settings.get()).hotel_name).toBe('Trinity Residency');
      // Occupancy is rebuilt, so 101 is taken again.
      expect(await fresh.rooms.listAvailable()).not.toContain('101');
    } finally {
      await fresh.close();
    }
  });

  it('replaces existing data rather than merging it', async () => {
    await seed();
    const archive = (await env.backup.buildArchive()).bytes;

    const other = await createTestEnv();
    try {
      await other.customers.checkIn(formValues({ name: 'Old Record', room_number: '201' }), idImages());
      await other.backup.restoreBackup(archive);

      const page = await other.customers.search();
      expect(page.total).toBe(2);
      expect(page.items.some((c) => c.name === 'Old Record')).toBe(false);
      expect(await other.files.exists('hotel-data/customers/CUS-000001/id-front.jpg')).toBe(true);
      // The replaced customer's photos are gone too.
      expect(await other.files.listFiles('hotel-data/customers')).toHaveLength(8);
    } finally {
      await other.close();
    }
  });

  it('does not restore the PIN from the archive', async () => {
    await seed();
    const archive = (await env.backup.buildArchive()).bytes;

    const fresh = await createTestEnv();
    try {
      await fresh.settings.setPin('1111');
      await fresh.backup.restoreBackup(archive);
      expect(await fresh.settings.verifyPin('1111')).toBe(true);
    } finally {
      await fresh.close();
    }
  });

  it('rejects a file that is not a zip archive', async () => {
    await expect(env.backup.restoreBackup(utf8ToBytes('this is not a zip'))).rejects.toMatchObject({
      code: 'CORRUPT_BACKUP',
    });
  });

  it('rejects an empty file', async () => {
    await expect(env.backup.restoreBackup(new Uint8Array())).rejects.toMatchObject({
      code: 'CORRUPT_BACKUP',
    });
  });

  it('rejects a zip that is not a hotel backup', async () => {
    const foreign = zipSync({ 'readme.txt': utf8ToBytes('hello') });
    await expect(env.backup.restoreBackup(foreign)).rejects.toThrow(/missing its backup manifest/i);
  });

  it('rejects a truncated archive', async () => {
    const archive = (await env.backup.buildArchive()).bytes;
    const truncated = archive.slice(0, Math.floor(archive.length / 2));
    await expect(env.backup.restoreBackup(truncated)).rejects.toMatchObject({
      code: 'CORRUPT_BACKUP',
    });
  });

  it('rejects a backup written by a newer app version', async () => {
    const archive = zipSync({
      'manifest.json': utf8ToBytes(
        JSON.stringify({ format: BACKUP_FORMAT, version: 99, counts: {} }),
      ),
      'data.json': utf8ToBytes(JSON.stringify({ customers: [], rooms: [], settings: {} })),
    });
    await expect(env.backup.restoreBackup(archive)).rejects.toThrow(/newer version/i);
  });

  it('rejects damaged json inside a valid zip', async () => {
    const archive = zipSync({
      'manifest.json': utf8ToBytes(
        JSON.stringify({ format: BACKUP_FORMAT, version: 1, counts: {} }),
      ),
      'data.json': utf8ToBytes('{ "customers": [ '),
    });
    await expect(env.backup.restoreBackup(archive)).rejects.toMatchObject({
      code: 'CORRUPT_BACKUP',
    });
  });

  it('leaves the database untouched when the archive is rejected', async () => {
    await seed();
    await env.backup.restoreBackup(utf8ToBytes('nope')).catch(() => undefined);
    expect((await env.customers.search()).total).toBe(2);
  });

  it('skips individual damaged records but keeps the good ones', async () => {
    const good = {
      id: 1,
      customer_code: 'CUS-000001',
      name: 'Good Record',
      address: 'Somewhere',
      phone: '9847012345',
      room_number: '101',
      number_of_persons: 2,
      id_front_path: 'x',
      id_back_path: 'y',
      check_in_date: '2026-08-18T10:35:00.000+05:30',
      check_out_date: null,
      status: 'CHECKED_IN',
      created_at: '2026-08-18T10:35:00.000+05:30',
      updated_at: '2026-08-18T10:35:00.000+05:30',
    };
    const archive = zipSync({
      'manifest.json': utf8ToBytes(
        JSON.stringify({ format: BACKUP_FORMAT, version: 1, counts: {} }),
      ),
      'data.json': utf8ToBytes(
        JSON.stringify({
          customers: [good, { name: 'no code' }, null, { ...good, customer_code: '../evil' }],
          rooms: [{ room_number: '101', created_at: good.created_at }],
          settings: {},
        }),
      ),
    });

    const summary = await env.backup.restoreBackup(archive);
    expect(summary.customers).toBe(1);
    expect(summary.warnings).toHaveLength(3);
    expect((await env.customers.search()).items[0].name).toBe('Good Record');
  });

  it('repairs an archive that double-books a room', async () => {
    const base = {
      address: 'Somewhere',
      phone: '9847012345',
      room_number: '101',
      number_of_persons: 1,
      id_front_path: 'x',
      id_back_path: 'y',
      check_in_date: '2026-08-18T10:35:00.000+05:30',
      check_out_date: null,
      status: 'CHECKED_IN',
      created_at: '2026-08-18T10:35:00.000+05:30',
      updated_at: '2026-08-18T10:35:00.000+05:30',
    };
    const archive = zipSync({
      'manifest.json': utf8ToBytes(
        JSON.stringify({ format: BACKUP_FORMAT, version: 1, counts: {} }),
      ),
      'data.json': utf8ToBytes(
        JSON.stringify({
          customers: [
            { ...base, id: 1, customer_code: 'CUS-000001', name: 'First' },
            { ...base, id: 2, customer_code: 'CUS-000002', name: 'Second' },
          ],
          rooms: [],
          settings: {},
        }),
      ),
    });

    const summary = await env.backup.restoreBackup(archive);
    expect(summary.customers).toBe(2);
    expect(summary.warnings.join(' ')).toMatch(/two active guests/);
    expect((await env.customers.search({ filter: 'CHECKED_IN' })).total).toBe(1);
    // The room referenced by the booking exists even though rooms[] was empty.
    expect(await env.rooms.listAvailable()).toEqual([]);
  });

  it('ignores archive entries that try to escape the customer folder', async () => {
    const archive = zipSync({
      'manifest.json': utf8ToBytes(
        JSON.stringify({ format: BACKUP_FORMAT, version: 1, counts: {} }),
      ),
      'data.json': utf8ToBytes(JSON.stringify({ customers: [], rooms: [], settings: {} })),
      'images/../../evil.jpg': utf8ToBytes('bad'),
      'images/CUS-000001/../../evil.jpg': utf8ToBytes('bad'),
    });

    const summary = await env.backup.restoreBackup(archive);
    expect(summary.images).toBe(0);
    expect(summary.warnings.length).toBeGreaterThan(0);
    expect(await env.files.exists('evil.jpg')).toBe(false);
  });
});
