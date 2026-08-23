/**
 * Export / restore. This is the only safety net the hotel has, so both flows
 * report exactly what happened, including partial problems.
 */

import { useRef, useState } from 'react';
import { useAsyncData } from '../../hooks/useAsyncData';
import { Notice, Spinner } from '../../components/Feedback';
import { useConfirm } from '../../components/ConfirmProvider';
import { useToast } from '../../components/ToastProvider';
import { useServices } from '../../context/ServicesContext';
import { formatDateTime } from '../../utils/date';
import { formatBytes } from '../../utils/imageCompression';
import { AppError } from '../../utils/errors';
import { AUTO_BACKUP_KEEP } from '../../services/autoBackupService';
import type { ExportResult, RestoreSummary } from '../../services/backupService';

const MAX_BACKUP_FILE_BYTES = 400 * 1024 * 1024;

export function BackupSettings() {
  const { backup, autoBackup, hotel, reloadHotel, invalidateData } = useServices();
  const confirm = useConfirm();
  const toast = useToast();
  const fileInput = useRef<HTMLInputElement>(null);

  const [busy, setBusy] = useState<'export' | 'export-data' | 'restore' | null>(null);
  const [lastExport, setLastExport] = useState<ExportResult | null>(null);
  const [lastRestore, setLastRestore] = useState<RestoreSummary | null>(null);
  const [savingToggle, setSavingToggle] = useState(false);

  const auto = useAsyncData(
    async () => ({
      enabled: await autoBackup.isEnabled(),
      lastRunAt: await autoBackup.lastRunAt(),
      archives: await autoBackup.listArchives(),
    }),
    [autoBackup, hotel.last_backup_at],
    'autoBackupStatus',
  );

  const toggleAuto = async (enabled: boolean) => {
    setSavingToggle(true);
    try {
      await autoBackup.setEnabled(enabled);
      auto.reload();
      toast.success(enabled ? 'Automatic daily backup is on' : 'Automatic daily backup is off');
    } catch (e) {
      toast.error(e);
    } finally {
      setSavingToggle(false);
    }
  };

  const runExport = async (includeImages: boolean) => {
    setBusy(includeImages ? 'export' : 'export-data');
    setLastRestore(null);
    try {
      const result = await backup.exportBackup(includeImages);
      setLastExport(result);
      await reloadHotel();
      toast.success(`Backup saved (${formatBytes(result.bytes)})`);
    } catch (e) {
      toast.error(e);
    } finally {
      setBusy(null);
    }
  };

  const onFileChosen = async (file: File | undefined) => {
    if (!file) return;
    setLastExport(null);
    try {
      if (file.size === 0) {
        throw new AppError('CORRUPT_BACKUP', 'That backup file is empty.');
      }
      if (file.size > MAX_BACKUP_FILE_BYTES) {
        throw new AppError('RESTORE_FAILED', 'That backup file is too large to open on this device.');
      }

      const bytes = new Uint8Array(await file.arrayBuffer());
      // Validate before asking, so a bad file never reaches the warning dialog.
      const { manifest } = await backup.inspect(bytes);

      const ok = await confirm({
        title: 'Restore this backup?',
        message: (
          <>
            <p className="mb0">
              <strong>Warning:</strong> restoring this backup will replace the current hotel data on
              this device.
            </p>
            <p className="mb0 mt">
              Backup from {formatDateTime(manifest.created_at)} — {manifest.counts.customers}{' '}
              customers, {manifest.counts.rooms} rooms,{' '}
              {manifest.includes_images ? `${manifest.counts.images} photos` : 'no photos'}.
            </p>
            <p className="mt mb0">Continue?</p>
          </>
        ),
        confirmLabel: 'Restore',
        danger: true,
      });
      if (!ok) return;

      setBusy('restore');
      const summary = await backup.restoreBackup(bytes);
      setLastRestore(summary);
      invalidateData();
      await reloadHotel();
      toast.success(`Restored ${summary.customers} customer records`);
    } catch (e) {
      toast.error(e);
      setLastRestore(null);
    } finally {
      setBusy(null);
      if (fileInput.current) fileInput.current.value = '';
    }
  };

  return (
    <>
      <div className="section-title">Data</div>
      <div className="card">
        <Notice kind="warn">
          Your customer data is stored only on this device. Regularly export a backup to prevent
          data loss if the device is lost, damaged or reset.
        </Notice>

        <p className="small muted">
          Last backup:{' '}
          <strong>{hotel.last_backup_at ? formatDateTime(hotel.last_backup_at) : 'never'}</strong>
        </p>

        <label className="toggle-row">
          <span className="grow">
            <span className="label">Automatic daily backup</span>
            <span className="hint">
              {auto.data
                ? auto.data.enabled
                  ? `Keeps the last ${AUTO_BACKUP_KEEP} on this device` +
                    (auto.data.lastRunAt
                      ? ` · last run ${formatDateTime(auto.data.lastRunAt)}`
                      : ' · not run yet')
                  : 'Turned off — only manual exports are made'
                : 'Checking…'}
            </span>
          </span>
          <input
            type="checkbox"
            checked={auto.data?.enabled ?? false}
            disabled={!auto.data || savingToggle}
            onChange={(e) => void toggleAuto(e.target.checked)}
          />
        </label>

        <button
          type="button"
          className="btn block"
          disabled={busy !== null}
          onClick={() => runExport(true)}
        >
          {busy === 'export' ? (
            <>
              <Spinner small onBrand /> Building backup…
            </>
          ) : (
            'Export Backup (with ID photos)'
          )}
        </button>

        <button
          type="button"
          className="btn secondary block mt"
          disabled={busy !== null}
          onClick={() => runExport(false)}
        >
          {busy === 'export-data' ? 'Exporting…' : 'Export data only (no photos)'}
        </button>

        <button
          type="button"
          className="btn secondary block mt"
          disabled={busy !== null}
          onClick={() => fileInput.current?.click()}
        >
          {busy === 'restore' ? (
            <>
              <Spinner small /> Restoring…
            </>
          ) : (
            'Restore Backup'
          )}
        </button>
        <input
          ref={fileInput}
          type="file"
          accept=".zip,application/zip"
          style={{ display: 'none' }}
          onChange={(e) => void onFileChosen(e.target.files?.[0])}
        />

        {lastExport ? (
          <Notice kind="info">
            <div className="strong">{lastExport.fileName}</div>
            <div className="small">
              {lastExport.customers} customers · {lastExport.images} photos ·{' '}
              {formatBytes(lastExport.bytes)}
            </div>
            <div className="small mono" style={{ wordBreak: 'break-all' }}>
              {lastExport.location}
            </div>
            {lastExport.warnings.length ? (
              <ul className="small">
                {lastExport.warnings.slice(0, 5).map((w) => (
                  <li key={w}>{w}</li>
                ))}
                {lastExport.warnings.length > 5 ? (
                  <li>and {lastExport.warnings.length - 5} more…</li>
                ) : null}
              </ul>
            ) : null}
          </Notice>
        ) : null}

        {lastRestore ? (
          <Notice kind={lastRestore.warnings.length ? 'warn' : 'info'}>
            <div className="strong">Restore complete</div>
            <div className="small">
              {lastRestore.customers} customers · {lastRestore.rooms} rooms · {lastRestore.images}{' '}
              photos
            </div>
            {lastRestore.warnings.length ? (
              <ul className="small">
                {lastRestore.warnings.slice(0, 5).map((w) => (
                  <li key={w}>{w}</li>
                ))}
                {lastRestore.warnings.length > 5 ? (
                  <li>and {lastRestore.warnings.length - 5} more…</li>
                ) : null}
              </ul>
            ) : null}
          </Notice>
        ) : null}

        <p className="field-hint">
          Backups are written to the app's folder on this device. An automatic backup protects you
          from a forgotten export, but not from a lost or broken phone — copy a .zip to a computer
          or SD card regularly.
        </p>
      </div>
    </>
  );
}
