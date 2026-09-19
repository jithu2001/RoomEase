import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../database/app_database.dart';
import '../../services/file_store.dart' show customersRoot;
import '../../state/app_state.dart';
import '../../widgets/feedback.dart';

/// "Danger Zone" — wiping every customer record and ID photo from the device.
class DangerZoneSettings extends StatefulWidget {
  const DangerZoneSettings({super.key});

  @override
  State<DangerZoneSettings> createState() => _DangerZoneSettingsState();
}

class _DangerZoneSettingsState extends State<DangerZoneSettings> {
  int? _customerCount;

  @override
  void initState() {
    super.initState();
    _loadCount();
  }

  Future<void> _loadCount() async {
    final appState = context.read<AppState>();
    final customers = await appState.services.customers.search();
    if (mounted) setState(() => _customerCount = customers.total);
  }

  Future<void> _clearAllData() async {
    final confirmed = await showConfirmDialog(
      context,
      title: 'Clear All Data',
      message: 'This permanently deletes every customer record, every ID photo and the room list from this '
          'device. Your hotel name and app PIN are kept. There is no cloud copy — export a backup first if '
          'you want to keep this data.',
      confirmLabel: 'Clear All Data',
      danger: true,
      requirePhrase: 'DELETE',
    );
    if (!confirmed || !mounted) return;
    final appState = context.read<AppState>();
    try {
      await wipeAllTables(appState.services.db);
      await appState.services.files.removeDir(customersRoot);
      appState.invalidateData();
      await appState.reloadHotel();
      await _loadCount();
      if (mounted) context.showSuccessToast('All customer data cleared');
    } catch (e) {
      if (mounted) context.showErrorToast(e);
    }
  }

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return Card(
      color: scheme.errorContainer.withValues(alpha: 0.3),
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text('Danger Zone', style: Theme.of(context).textTheme.titleSmall),
            const SizedBox(height: 8),
            Text('${_customerCount ?? '…'} customer records and their ID photos.'),
            const SizedBox(height: 12),
            FilledButton(
              onPressed: _clearAllData,
              style: FilledButton.styleFrom(backgroundColor: scheme.error, foregroundColor: scheme.onError),
              child: const Text('Clear All Data'),
            ),
          ],
        ),
      ),
    );
  }
}
