/**
 * Automatic daily local backup.
 *
 * All customer data lives on one phone, so the realistic failure mode is not a
 * bug — it is a lost, wiped or broken device with a month of check-ins on it and
 * nobody having pressed "Export Backup". This runs once per calendar day, in the
 * background, and keeps a rolling window of archives on device storage.
 *
 * Rules it deliberately follows:
 *  - never throws: a failed backup must not break app start-up
 *  - never blocks the first paint (the caller schedules it after boot)
 *  - skips when there is nothing to protect, so day one does not create noise
 *  - prunes only its own folder, never the staff's manual exports
 */

import { backupStamp, toDayKey, toIso } from '../utils/date';
import { AppError, logError, toUserMessage } from '../utils/errors';
import { AUTO_BACKUP_DIR, type FileStore } from './fileStore';
import type { BackupService } from './backupService';
import type { CustomerRepository } from '../database/repositories/customerRepository';
import type { SettingsRepository } from '../database/repositories/settingsRepository';

/** How many automatic archives to retain. Roughly a week of history. */
export const AUTO_BACKUP_KEEP = 7;

export const AUTO_BACKUP_ENABLED_KEY = 'auto_backup_enabled';
export const AUTO_BACKUP_DAY_KEY = 'last_auto_backup_day';
/**
 * Timestamp of the last automatic archive.
 *
 * Deliberately separate from `last_backup_at`, which tracks *manual* exports.
 * An automatic archive sits on the same phone as the data it protects, so it
 * must not silence the dashboard's "copy a backup off this device" reminder.
 */
export const AUTO_BACKUP_AT_KEY = 'last_auto_backup_at';

export type AutoBackupStatus =
  | 'disabled'
  | 'up-to-date'
  | 'nothing-to-back-up'
  | 'written'
  | 'failed';

export interface AutoBackupResult {
  status: AutoBackupStatus;
  fileName?: string;
  bytes?: number;
  /** How many old archives were deleted by retention. */
  pruned?: number;
  /** Present when status is 'failed' — safe to show to staff. */
  message?: string;
  /** True when photos had to be left out to keep the archive buildable. */
  dataOnly?: boolean;
}

export class AutoBackupService {
  constructor(
    private readonly backup: BackupService,
    private readonly settings: SettingsRepository,
    private readonly files: FileStore,
    private readonly customers: CustomerRepository,
  ) {}

  /** Missing setting means enabled: existing installs opt in on upgrade. */
  async isEnabled(): Promise<boolean> {
    const stored = await this.settings.get(AUTO_BACKUP_ENABLED_KEY);
    return stored === null || stored === '' ? true : stored === '1';
  }

  async setEnabled(enabled: boolean): Promise<void> {
    await this.settings.set(AUTO_BACKUP_ENABLED_KEY, enabled ? '1' : '0');
  }

  /** `YYYY-MM-DD` of the last successful automatic backup, or ''. */
  async lastRunDay(): Promise<string> {
    return (await this.settings.get(AUTO_BACKUP_DAY_KEY)) ?? '';
  }

  /** ISO timestamp of the last automatic backup, or ''. */
  async lastRunAt(): Promise<string> {
    return (await this.settings.get(AUTO_BACKUP_AT_KEY)) ?? '';
  }

  async listArchives() {
    return this.files.listShared(AUTO_BACKUP_DIR);
  }

  /**
   * Runs a backup if one is due today. Safe to call on every app start.
   */
  async runIfDue(now: Date = new Date()): Promise<AutoBackupResult> {
    try {
      if (!(await this.isEnabled())) return { status: 'disabled' };

      const today = toDayKey(now);
      if ((await this.lastRunDay()) === today) return { status: 'up-to-date' };

      // Nothing to lose yet — don't write an empty archive on a fresh install.
      if ((await this.customers.count()) === 0) return { status: 'nothing-to-back-up' };

      // Years of ID photos can outgrow what the WebView can hold in memory.
      // Losing the records too would be far worse than losing the photos from
      // one archive, so fall back to a data-only backup instead of failing.
      let bytes: Uint8Array;
      let dataOnly = false;
      try {
        bytes = (await this.backup.buildArchive(true)).bytes;
      } catch (e) {
        if (!(e instanceof AppError) || e.code !== 'BACKUP_FAILED') throw e;
        logError('autoBackup.photosTooLarge', e);
        bytes = (await this.backup.buildArchive(false)).bytes;
        dataOnly = true;
      }

      const fileName = `hotel-autobackup-${backupStamp(now)}${dataOnly ? '-data-only' : ''}.zip`;
      await this.files.writeShared(fileName, bytes, AUTO_BACKUP_DIR);

      // Mark the day only after the archive is safely written.
      await this.settings.set(AUTO_BACKUP_DAY_KEY, today);
      await this.settings.set(AUTO_BACKUP_AT_KEY, toIso(now));

      const pruned = await this.prune();
      return { status: 'written', fileName, bytes: bytes.length, pruned, dataOnly };
    } catch (e) {
      // A backup problem must never stop the app from opening.
      logError('autoBackup', e);
      return { status: 'failed', message: toUserMessage(e) };
    }
  }

  /** Deletes the oldest automatic archives beyond the retention window. */
  private async prune(): Promise<number> {
    const archives = await this.files.listShared(AUTO_BACKUP_DIR);
    const excess = archives.slice(AUTO_BACKUP_KEEP);
    for (const file of excess) {
      await this.files.removeShared(file.path);
    }
    return excess.length;
  }
}
