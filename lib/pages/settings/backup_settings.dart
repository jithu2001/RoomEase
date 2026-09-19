
import 'package:file_picker/file_picker.dart';
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:share_plus/share_plus.dart';

import '../../services/backup_service.dart';
import '../../state/app_state.dart';
import '../../utils/app_date.dart';
import '../../widgets/feedback.dart';

const _maxRestoreBytes = 400 * 1024 * 1024;

/// "Data" section (backup export/restore) embedded in Settings — mirrors
/// `pages/Settings/BackupSettings.tsx`.
class BackupSettings extends StatefulWidget {
  const BackupSettings({super.key});

  @override
  State<BackupSettings> createState() => _BackupSettingsState();
}

class _BackupSettingsState extends State<BackupSettings> {
  bool _busy = false;
  bool _sharing = false;
  bool _saving = false;
  ExportResult? _lastExport;
  bool _lastExportHadImages = true;
  RestoreSummary? _lastRestore;
  bool? _autoBackupEnabled;
  String? _lastAutoRun;

  @override
  void initState() {
    super.initState();
    _loadAutoBackupState();
  }

  Future<void> _loadAutoBackupState() async {
    final appState = context.read<AppState>();
    final results = await Future.wait([appState.services.autoBackup.isEnabled(), appState.services.autoBackup.lastRunAt()]);
    if (mounted) {
      setState(() {
        _autoBackupEnabled = results[0] as bool;
        _lastAutoRun = results[1] as String?;
      });
    }
  }

  Future<void> _export(bool includeImages) async {
    setState(() {
      _busy = true;
      _lastExport = null;
    });
    final appState = context.read<AppState>();
    try {
      final result = await appState.services.backup.exportBackup(includeImages: includeImages);
      await appState.reloadHotel();
      if (mounted) {
        setState(() {
          _lastExport = result;
          _lastExportHadImages = includeImages;
        });
      }
    } catch (e) {
      if (mounted) context.showErrorToast(e);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  /// Hands the most recent export to the Android share sheet, so it can go to
  /// Drive, OneDrive, email or a chat app without hunting for the file.
  ///
  /// Shares the archive that was just written rather than building a new one —
  /// re-exporting would leave a second copy behind on the device.
  Future<void> _shareLastExport() async {
    final export = _lastExport;
    if (export == null) return;
    setState(() => _sharing = true);
    try {
      final result = await SharePlus.instance.share(
        ShareParams(
          // No `text`: some Android targets send the note instead of the file
          // when both are present.
          subject: export.fileName,
          files: [XFile(export.path, mimeType: 'application/zip', name: export.fileName)],
        ),
      );
      if (!mounted) return;
      if (result.status == ShareResultStatus.unavailable) {
        context.showErrorToast('No app on this device can share that file.');
      }
    } catch (e) {
      if (mounted) context.showErrorToast(e);
    } finally {
      if (mounted) setState(() => _sharing = false);
    }
  }

  /// Saves a copy of the backup wherever the user chooses — Downloads,
  /// Documents, an SD card or a cloud folder — via the system save dialog.
  ///
  /// The app's own copy lives under `Android/data/`, which Android 11+ hides
  /// from the Files app, so this is the only way most people can actually get
  /// at their backup on the device.
  Future<void> _saveCopy() async {
    final export = _lastExport;
    if (export == null) return;
    setState(() => _saving = true);
    final appState = context.read<AppState>();
    try {
      // Rebuilt rather than read back from disk: it keeps file access in the
      // service layer, and the contents are the same archive.
      final built = await appState.services.backup.buildArchive(includeImages: _lastExportHadImages);
      final uri = await FilePicker.saveFile(
        fileName: export.fileName,
        bytes: built.bytes,
        mimeType: 'application/zip',
        dialogTitle: 'Save backup',
      );
      if (!mounted) return;
      if (uri != null) context.showSuccessToast('Backup saved as ${export.fileName}');
    } catch (e) {
      if (mounted) context.showErrorToast(e);
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  Future<void> _restore() async {
    final file = await FilePicker.pickFile(type: FileType.custom, allowedExtensions: ['zip']);
    if (file == null) return;
    final bytes = await file.readAsBytes();
    if (bytes.isEmpty) {
      if (mounted) context.showErrorToast('That file is empty.');
      return;
    }
    if (bytes.length > _maxRestoreBytes) {
      if (mounted) context.showErrorToast('That file is too large to be a valid backup.');
      return;
    }
    if (!mounted) return;

    final appState = context.read<AppState>();
    BackupManifest manifest;
    try {
      manifest = await appState.services.backup.inspect(bytes);
    } catch (e) {
      if (mounted) context.showErrorToast(e);
      return;
    }
    if (!mounted) return;

    final confirmed = await showConfirmDialog(
      context,
      title: 'Restore this backup?',
      message: 'Restoring this backup will replace the current hotel data on this device.\n\n'
          'Backup from ${formatDateTime(manifest.createdAt)} — ${manifest.counts.customers} customers, '
          '${manifest.counts.rooms} rooms, ${manifest.counts.images > 0 ? '${manifest.counts.images} photos' : 'no photos'}.\n\n'
          'Continue?',
      confirmLabel: 'Restore',
      danger: true,
    );
    if (!confirmed) return;

    setState(() {
      _busy = true;
      _lastRestore = null;
    });
    try {
      final restored = await appState.services.backup.restoreBackup(bytes);
      appState.invalidateData();
      await appState.reloadHotel();
      if (mounted) {
        setState(() => _lastRestore = restored);
        context.showSuccessToast('Restored ${restored.customers} customer records');
      }
    } catch (e) {
      if (mounted) context.showErrorToast(e);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final appState = context.watch<AppState>();
    final lastBackup = appState.hotel.lastBackupAt;
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            const Notice(
              kind: NoticeKind.warn,
              message: 'Your customer data is stored only on this device. Regularly export a backup and keep a copy elsewhere.',
            ),
            const SizedBox(height: 12),
            Text('Last backup: ${lastBackup.isEmpty ? 'never' : formatDateTime(lastBackup)}'),
            const SizedBox(height: 8),
            if (_autoBackupEnabled != null)
              SwitchListTile(
                contentPadding: EdgeInsets.zero,
                title: const Text('Automatic daily backup'),
                subtitle: Text(_autoBackupEnabled!
                    ? 'Keeps the last 7 backups. Last run: ${_lastAutoRun != null && _lastAutoRun!.isNotEmpty ? formatDateTime(_lastAutoRun) : 'not yet'}.'
                    : 'Turned off.'),
                value: _autoBackupEnabled!,
                onChanged: (v) async {
                  await appState.services.autoBackup.setEnabled(v);
                  setState(() => _autoBackupEnabled = v);
                },
              ),
            const SizedBox(height: 8),
            FilledButton(onPressed: _busy ? null : () => _export(true), child: const Text('Export Backup (with ID photos)')),
            const SizedBox(height: 8),
            OutlinedButton(onPressed: _busy ? null : () => _export(false), child: const Text('Export data only (no photos)')),
            const SizedBox(height: 8),
            OutlinedButton(onPressed: _busy ? null : _restore, child: const Text('Restore Backup')),
            if (_lastExport != null) ...[
              const SizedBox(height: 12),
              Notice(
                message: '${_lastExport!.fileName}\n${_lastExport!.customers} customers, ${_lastExport!.images} photos\n${_lastExport!.path}',
                kind: _lastExport!.warnings.isEmpty ? NoticeKind.info : NoticeKind.warn,
              ),
              const SizedBox(height: 8),
              FilledButton.icon(
                onPressed: _saving ? null : _saveCopy,
                icon: const Icon(Icons.save_alt),
                label: Text(_saving ? 'Saving…' : 'Save to my files…'),
              ),
              const SizedBox(height: 8),
              OutlinedButton.icon(
                onPressed: _sharing ? null : _shareLastExport,
                icon: const Icon(Icons.ios_share),
                label: Text(_sharing ? 'Opening…' : 'Share this backup'),
              ),
              if (_lastExport!.images > 0) ...[
                const SizedBox(height: 4),
                Text(
                  'This archive contains ${_lastExport!.images} guest ID photos. '
                  'Prefer a data-only export when sending it through a chat app.',
                  style: TextStyle(color: Theme.of(context).colorScheme.onSurfaceVariant, fontSize: 12),
                ),
              ],
            ],
            if (_lastRestore != null) ...[
              const SizedBox(height: 12),
              Notice(
                message: 'Restored ${_lastRestore!.customers} customers, ${_lastRestore!.rooms} rooms, ${_lastRestore!.images} photos.'
                    '${_lastRestore!.warnings.isNotEmpty ? '\n\n${_lastRestore!.warnings.take(5).join('\n')}' : ''}',
                kind: _lastRestore!.warnings.isEmpty ? NoticeKind.info : NoticeKind.warn,
              ),
            ],
            const SizedBox(height: 8),
            Text(
              'The app keeps its own copy in a private folder that Android hides from the Files app. '
              'Use \'Save to my files\' to put a copy somewhere you can find it, such as Downloads, or Share to send it straight to Drive.\n\n'
              'Cloud apps keep every upload as a separate file, so delete old copies there from time to time.',
              style: TextStyle(color: Theme.of(context).colorScheme.onSurfaceVariant, fontSize: 12),
            ),
          ],
        ),
      ),
    );
  }
}
