import { beforeEach, afterEach, describe, expect, it } from 'vitest';
import { createTestEnv, formValues, idImages, type TestEnv } from './helpers/testEnv';
import { AUTO_BACKUP_DIR } from '../src/services/fileStore';
import { AUTO_BACKUP_KEEP } from '../src/services/autoBackupService';
import { AppError } from '../src/utils/errors';

let env: TestEnv;

beforeEach(async () => {
  env = await createTestEnv();
});

afterEach(async () => {
  await env.close();
});

const day = (n: number) => new Date(2026, 7, n, 9, 30);

async function seedGuest(room = '101') {
  return env.customers.checkIn(formValues({ room_number: room }), idImages());
}

describe('automatic backup', () => {
  it('is enabled by default on a fresh install', async () => {
    expect(await env.autoBackup.isEnabled()).toBe(true);
  });

  it('treats a database with no setting as enabled (upgrade path)', async () => {
    await env.db.run("DELETE FROM settings WHERE key = 'auto_backup_enabled'");
    expect(await env.autoBackup.isEnabled()).toBe(true);
  });

  it('writes nothing when there are no customers yet', async () => {
    const result = await env.autoBackup.runIfDue(day(18));
    expect(result.status).toBe('nothing-to-back-up');
    expect(env.files.shared.size).toBe(0);
    // The day is not recorded, so the first real check-in still gets a backup.
    expect(await env.autoBackup.lastRunDay()).toBe('');
  });

  it('writes an archive once data exists', async () => {
    await seedGuest();
    const result = await env.autoBackup.runIfDue(day(18));

    expect(result.status).toBe('written');
    expect(result.fileName).toMatch(/^hotel-autobackup-2026-08-18-\d{4}\.zip$/);
    expect(result.bytes).toBeGreaterThan(0);
    expect(await env.autoBackup.lastRunDay()).toBe('2026-08-18');

    const archives = await env.autoBackup.listArchives();
    expect(archives).toHaveLength(1);
    expect(archives[0].path).toBe(`backups/${AUTO_BACKUP_DIR}/${result.fileName}`);
  });

  it('produces a restorable archive', async () => {
    await seedGuest();
    await env.autoBackup.runIfDue(day(18));
    const [archive] = await env.autoBackup.listArchives();
    const bytes = env.files.shared.get(archive.path)!;

    const fresh = await createTestEnv();
    try {
      const summary = await fresh.backup.restoreBackup(bytes);
      expect(summary.customers).toBe(1);
      expect(summary.warnings).toEqual([]);
      expect((await fresh.customers.search()).items[0].name).toBe('Anoob Suresh');
    } finally {
      await fresh.close();
    }
  });

  it('runs at most once per calendar day', async () => {
    await seedGuest();
    expect((await env.autoBackup.runIfDue(day(18))).status).toBe('written');
    expect((await env.autoBackup.runIfDue(day(18))).status).toBe('up-to-date');
    expect(await env.autoBackup.listArchives()).toHaveLength(1);

    expect((await env.autoBackup.runIfDue(day(19))).status).toBe('written');
    expect(await env.autoBackup.listArchives()).toHaveLength(2);
  });

  it('does nothing while switched off', async () => {
    await seedGuest();
    await env.autoBackup.setEnabled(false);

    expect((await env.autoBackup.runIfDue(day(18))).status).toBe('disabled');
    expect(await env.autoBackup.listArchives()).toEqual([]);

    await env.autoBackup.setEnabled(true);
    expect((await env.autoBackup.runIfDue(day(18))).status).toBe('written');
  });

  it('keeps only the most recent archives', async () => {
    await seedGuest();
    for (let d = 1; d <= AUTO_BACKUP_KEEP + 3; d += 1) {
      const result = await env.autoBackup.runIfDue(day(d));
      expect(result.status).toBe('written');
    }

    const archives = await env.autoBackup.listArchives();
    expect(archives).toHaveLength(AUTO_BACKUP_KEEP);
    // Newest first, and the three oldest days are gone.
    expect(archives[0].name).toContain('2026-08-10');
    expect(archives.map((a) => a.name).join(' ')).not.toContain('2026-08-01');
  });

  it('never lets a storage failure break start-up', async () => {
    await seedGuest();
    env.files.writeShared = async () => {
      throw new Error('storage full');
    };

    const result = await env.autoBackup.runIfDue(day(18));
    expect(result.status).toBe('failed');
    expect(result.message).toBeTruthy();
    // Not marked done, so the next launch retries.
    expect(await env.autoBackup.lastRunDay()).toBe('');
  });

  it('records its own timestamp without silencing the manual-export reminder', async () => {
    await seedGuest();
    await env.autoBackup.runIfDue(day(18));

    expect(await env.autoBackup.lastRunAt()).toContain('2026-08-18');
    // An archive sitting on the same phone must not count as "backed up" for
    // the dashboard nudge, which is about getting a copy off the device.
    expect(await env.settings.lastBackupAt()).toBe('');
  });

  it('falls back to a data-only archive when the photos will not fit', async () => {
    await seedGuest();
    const realBuild = env.backup.buildArchive.bind(env.backup);
    let askedForImages = 0;
    env.backup.buildArchive = async (includeImages = true) => {
      if (includeImages) {
        askedForImages += 1;
        throw new AppError('BACKUP_FAILED', 'too many photos');
      }
      return realBuild(false);
    };

    const result = await env.autoBackup.runIfDue(day(18));
    expect(askedForImages).toBe(1);
    expect(result.status).toBe('written');
    expect(result.dataOnly).toBe(true);
    expect(result.fileName).toContain('-data-only');
    // The records are still protected, and the day is marked done.
    expect(await env.autoBackup.lastRunDay()).toBe('2026-08-18');
  });

  it('does not touch manual exports when pruning', async () => {
    await seedGuest();
    await env.backup.exportBackup();
    const manual = [...env.files.shared.keys()].find((k) => k.includes('hotel-backup-'));
    expect(manual).toBeTruthy();

    for (let d = 1; d <= AUTO_BACKUP_KEEP + 3; d += 1) {
      await env.autoBackup.runIfDue(day(d));
    }
    expect(env.files.shared.has(manual!)).toBe(true);
  });
});
