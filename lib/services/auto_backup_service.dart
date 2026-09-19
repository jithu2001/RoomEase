import 'dart:typed_data';

import '../database/repositories/customer_repository.dart';
import '../database/repositories/settings_repository.dart';
import '../models/models.dart';
import '../utils/app_date.dart';
import '../utils/app_error.dart';
import 'backup_service.dart';
import 'file_store.dart';

/// Archives kept in the automatic-backup folder — roughly a week's worth.
const autoBackupKeep = 7;

enum AutoBackupStatus { disabled, upToDate, nothingToBackUp, written, failed }

class AutoBackupResult {
  final AutoBackupStatus status;
  final String? fileName;
  final int? bytes;
  final int? pruned;
  final String? message;
  final bool dataOnly;
  const AutoBackupResult({
    required this.status,
    this.fileName,
    this.bytes,
    this.pruned,
    this.message,
    this.dataOnly = false,
  });
}

/// Runs at most once per calendar day, keeping the last [autoBackupKeep]
/// archives in a folder separate from manual exports. Never throws — a
/// failure here must never block app startup.
class AutoBackupService {
  final BackupService _backup;
  final SettingsRepository _settings;
  final FileStore _files;
  final CustomerRepository _customers;
  AutoBackupService(this._backup, this._settings, this._files, this._customers);

  Future<bool> isEnabled() async => ((await _settings.get('auto_backup_enabled')) ?? '1') != '0';

  Future<void> setEnabled(bool enabled) => _settings.set('auto_backup_enabled', enabled ? '1' : '0');

  Future<String?> lastRunDay() => _settings.get('last_auto_backup_day');
  Future<String?> lastRunAt() => _settings.get('last_auto_backup_at');

  Future<List<SharedFile>> listArchives() => _files.listShared(folder: autoBackupDir);

  Future<AutoBackupResult> runIfDue([DateTime? now]) async {
    final clock = now ?? DateTime.now();
    try {
      if (!await isEnabled()) return const AutoBackupResult(status: AutoBackupStatus.disabled);
      if (await lastRunDay() == toDayKey(clock)) {
        return const AutoBackupResult(status: AutoBackupStatus.upToDate);
      }
      final totalCustomers = await _customers.count(const CustomerQuery());
      if (totalCustomers == 0) {
        return const AutoBackupResult(status: AutoBackupStatus.nothingToBackUp);
      }

      var dataOnly = false;
      Uint8List bytes;
      try {
        final built = await _backup.buildArchive(includeImages: true);
        bytes = built.bytes;
      } on AppError catch (e) {
        if (e.code != AppErrorCode.backupFailed) rethrow;
        dataOnly = true;
        final built = await _backup.buildArchive(includeImages: false);
        bytes = built.bytes;
      }

      final fileName = 'hotel-autobackup-${backupStamp(clock)}${dataOnly ? '-data-only' : ''}.zip';
      await _files.writeShared(fileName, bytes, folder: autoBackupDir);

      // Only stamped after the write succeeds, so a failed write doesn't
      // falsely mark the day as already backed up.
      await _settings.set('last_auto_backup_day', toDayKey(clock));
      await _settings.set('last_auto_backup_at', nowIso());

      final pruned = await _prune();
      return AutoBackupResult(
        status: AutoBackupStatus.written,
        fileName: fileName,
        bytes: bytes.length,
        pruned: pruned,
        dataOnly: dataOnly,
      );
    } catch (e) {
      return AutoBackupResult(status: AutoBackupStatus.failed, message: toUserMessage(e));
    }
  }

  /// Prunes only this service's own `auto/` folder — manual exports in the
  /// parent `backups/` folder are never touched.
  Future<int> _prune() async {
    final archives = await listArchives(); // newest first
    if (archives.length <= autoBackupKeep) return 0;
    final excess = archives.sublist(autoBackupKeep);
    for (final file in excess) {
      await _files.removeShared(file.relativePath);
    }
    return excess.length;
  }
}
