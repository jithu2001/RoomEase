import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:package_info_plus/package_info_plus.dart';
import 'package:provider/provider.dart';

import '../../database/migrations.dart';
import '../../state/app_state.dart';
import '../../utils/app_date.dart';
import '../../widgets/app_scaffold.dart';

/// Settings index. Each section lives on its own page so this screen stays a
/// short, scannable list rather than one long stack of dense cards.
class SettingsPage extends StatefulWidget {
  const SettingsPage({super.key});

  @override
  State<SettingsPage> createState() => _SettingsPageState();
}

class _SettingsPageState extends State<SettingsPage> {
  int? _roomCount;
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
    if (mounted) setState(() => _roomCount = rooms.length);
  }

  @override
  Widget build(BuildContext context) {
    final appState = context.watch<AppState>();
    final hotel = appState.hotel;
    final theme = Theme.of(context);

    return AppScaffold(
      tab: AppTab.settings,
      title: 'Settings',
      body: ListView(
        padding: const EdgeInsets.fromLTRB(16, 8, 16, 96),
        children: [
          _SectionLabel('Hotel'),
          _SettingsGroup(
            children: [
              _SettingsTile(
                icon: Icons.storefront_outlined,
                title: 'Hotel information',
                subtitle: hotel.hotelName,
                onTap: () => context.push('/settings/hotel'),
              ),
              _SettingsTile(
                icon: Icons.meeting_room_outlined,
                title: 'Rooms',
                subtitle: '${_roomCount ?? '…'} rooms configured',
                onTap: () => context.push('/rooms'),
              ),
            ],
          ),
          _SectionLabel('Guests'),
          _SettingsGroup(
            children: [
              _SettingsTile(
                icon: Icons.chat_bubble_outline,
                title: 'WhatsApp welcome',
                subtitle: hotel.whatsappEnabled
                    ? 'On · country code +${hotel.whatsappCountryCode}'
                    : 'Off',
                onTap: () => context.push('/settings/whatsapp'),
              ),
            ],
          ),
          _SectionLabel('Security'),
          _SettingsGroup(
            children: [
              _SettingsTile(
                icon: Icons.lock_outline,
                title: 'App lock',
                subtitle: hotel.pinEnabled ? 'PIN required to open the app' : 'No PIN set',
                onTap: () => context.push('/settings/security'),
              ),
            ],
          ),
          _SectionLabel('Data'),
          _SettingsGroup(
            children: [
              _SettingsTile(
                icon: Icons.backup_outlined,
                title: 'Backup & restore',
                subtitle: hotel.lastBackupAt.isEmpty
                    ? 'No backup yet'
                    : 'Last backup ${formatDateTime(hotel.lastBackupAt)}',
                onTap: () => context.push('/settings/backup'),
              ),
              _SettingsTile(
                icon: Icons.warning_amber_outlined,
                title: 'Clear all data',
                subtitle: 'Delete every customer record on this device',
                danger: true,
                onTap: () => context.push('/settings/advanced'),
              ),
            ],
          ),
          _SectionLabel('About'),
          Card(
            margin: EdgeInsets.zero,
            child: Padding(
              padding: const EdgeInsets.all(16),
              child: DefaultTextStyle.merge(
                style: theme.textTheme.bodyMedium!.copyWith(color: theme.colorScheme.onSurfaceVariant),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text('App version: $_appVersion'),
                    Text('Database version: v$latestVersion'),
                    const Text('Storage: On-device SQLite + private file storage'),
                    const Text('Network: Works fully offline — no cloud, no accounts'),
                  ],
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _SectionLabel extends StatelessWidget {
  final String text;
  const _SectionLabel(this.text);

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Padding(
      padding: const EdgeInsets.fromLTRB(4, 20, 4, 8),
      child: Text(
        text.toUpperCase(),
        style: theme.textTheme.labelSmall?.copyWith(
          color: theme.colorScheme.primary,
          letterSpacing: 0.8,
          fontWeight: FontWeight.w700,
        ),
      ),
    );
  }
}

/// A card holding related tiles, hairline-divided so the group reads as one
/// block instead of a stack of separate cards.
class _SettingsGroup extends StatelessWidget {
  final List<Widget> children;
  const _SettingsGroup({required this.children});

  @override
  Widget build(BuildContext context) {
    return Card(
      margin: EdgeInsets.zero,
      clipBehavior: Clip.antiAlias,
      child: Column(
        children: [
          for (var i = 0; i < children.length; i++) ...[
            if (i > 0) const Divider(height: 1, indent: 56),
            children[i],
          ],
        ],
      ),
    );
  }
}

class _SettingsTile extends StatelessWidget {
  final IconData icon;
  final String title;
  final String subtitle;
  final VoidCallback onTap;
  final bool danger;
  const _SettingsTile({
    required this.icon,
    required this.title,
    required this.subtitle,
    required this.onTap,
    this.danger = false,
  });

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final tint = danger ? scheme.error : scheme.onSurfaceVariant;
    return ListTile(
      onTap: onTap,
      leading: Icon(icon, color: tint),
      title: Text(title, style: danger ? TextStyle(color: scheme.error) : null),
      subtitle: Text(subtitle, maxLines: 2, overflow: TextOverflow.ellipsis),
      trailing: const Icon(Icons.chevron_right),
    );
  }
}
