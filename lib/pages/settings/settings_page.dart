import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:package_info_plus/package_info_plus.dart';
import 'package:provider/provider.dart';

import '../../database/migrations.dart';
import '../../database/app_database.dart';
import '../../services/file_store.dart' show customersRoot;
import '../../state/app_state.dart';
import '../../widgets/app_scaffold.dart';
import '../../widgets/feedback.dart';
import 'backup_settings.dart';
import 'pin_settings.dart';

class SettingsPage extends StatefulWidget {
  const SettingsPage({super.key});

  @override
  State<SettingsPage> createState() => _SettingsPageState();
}

class _SettingsPageState extends State<SettingsPage> {
  late final _nameController = TextEditingController();
  late final _addressController = TextEditingController();
  late final _phoneController = TextEditingController();
  bool _saving = false;
  bool _initialised = false;
  int? _roomCount;
  int? _customerCount;
  String _appVersion = '';

  @override
  void initState() {
    super.initState();
    PackageInfo.fromPlatform().then((info) {
      if (mounted) setState(() => _appVersion = info.version);
    });
    _loadCounts();
  }

  Future<void> _loadCounts() async {
    final appState = context.read<AppState>();
    final rooms = await appState.services.rooms.list();
    final customers = await appState.services.customers.search();
    if (mounted) {
      setState(() {
        _roomCount = rooms.length;
        _customerCount = customers.total;
      });
    }
  }

  void _syncControllers(AppState appState) {
    if (_initialised) return;
    _initialised = true;
    _nameController.text = appState.hotel.hotelName;
    _addressController.text = appState.hotel.hotelAddress;
    _phoneController.text = appState.hotel.hotelPhone;
  }

  @override
  void dispose() {
    _nameController.dispose();
    _addressController.dispose();
    _phoneController.dispose();
    super.dispose();
  }

  Future<void> _saveHotelInfo() async {
    setState(() => _saving = true);
    final appState = context.read<AppState>();
    try {
      await appState.services.settings.saveHotelInfo(
        hotelName: _nameController.text,
        hotelAddress: _addressController.text,
        hotelPhone: _phoneController.text,
      );
      await appState.reloadHotel();
      if (mounted) context.showSuccessToast('Hotel information saved');
    } catch (e) {
      if (mounted) context.showErrorToast(e);
    } finally {
      if (mounted) setState(() => _saving = false);
    }
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
      await _loadCounts();
      if (mounted) context.showSuccessToast('All customer data cleared');
    } catch (e) {
      if (mounted) context.showErrorToast(e);
    }
  }

  @override
  Widget build(BuildContext context) {
    final appState = context.watch<AppState>();
    _syncControllers(appState);
    return AppScaffold(
      tab: AppTab.settings,
      title: 'Settings',
      body: ListView(
        padding: const EdgeInsets.fromLTRB(16, 16, 16, 96),
        children: [
          Card(
            child: Padding(
              padding: const EdgeInsets.all(16),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  Text('Hotel Information', style: Theme.of(context).textTheme.titleSmall),
                  const SizedBox(height: 12),
                  TextField(controller: _nameController, maxLength: 80, decoration: const InputDecoration(labelText: 'Hotel name')),
                  TextField(controller: _addressController, maxLines: 3, maxLength: 250, decoration: const InputDecoration(labelText: 'Address')),
                  TextField(controller: _phoneController, keyboardType: TextInputType.phone, maxLength: 20, decoration: const InputDecoration(labelText: 'Phone')),
                  const SizedBox(height: 8),
                  FilledButton(onPressed: _saving ? null : _saveHotelInfo, child: const Text('Save Hotel Information')),
                ],
              ),
            ),
          ),
          const SizedBox(height: 12),
          Card(
            child: ListTile(
              onTap: () => context.push('/rooms'),
              title: const Text('Rooms'),
              subtitle: Text('${_roomCount ?? '…'} rooms configured'),
              trailing: const Icon(Icons.chevron_right),
            ),
          ),
          const SizedBox(height: 12),
          const PinSettings(),
          const SizedBox(height: 12),
          const BackupSettings(),
          const SizedBox(height: 12),
          Card(
            color: Theme.of(context).colorScheme.errorContainer.withValues(alpha: 0.3),
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
                    style: FilledButton.styleFrom(
                      backgroundColor: Theme.of(context).colorScheme.error,
                      foregroundColor: Theme.of(context).colorScheme.onError,
                    ),
                    child: const Text('Clear All Data'),
                  ),
                ],
              ),
            ),
          ),
          const SizedBox(height: 12),
          Card(
            child: Padding(
              padding: const EdgeInsets.all(16),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  Text('About', style: Theme.of(context).textTheme.titleSmall),
                  const SizedBox(height: 8),
                  Text('App version: $_appVersion'),
                  const Text('Storage: On-device SQLite + private file storage'),
                  Text('Database version: v$latestVersion'),
                  const Text('Network: Works fully offline — no cloud, no accounts'),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }
}
