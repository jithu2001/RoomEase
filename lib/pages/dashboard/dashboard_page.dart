import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:provider/provider.dart';

import '../../models/models.dart';
import '../../state/app_state.dart';
import '../../utils/app_date.dart';
import '../../widgets/app_scaffold.dart';
import '../../widgets/feedback.dart';

class DashboardPage extends StatefulWidget {
  const DashboardPage({super.key});

  @override
  State<DashboardPage> createState() => _DashboardPageState();
}

class _DashboardPageState extends State<DashboardPage> {
  DashboardStats? _stats;
  List<Customer> _active = const [];
  String? _error;
  int? _loadedForDataVersion;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() => _error = null);
    final appState = context.read<AppState>();
    _loadedForDataVersion = appState.dataVersion;
    try {
      final results = await Future.wait([appState.services.customers.dashboard(), appState.services.customers.listActive()]);
      if (!mounted) return;
      setState(() {
        _stats = results[0] as DashboardStats;
        _active = (results[1] as List<Customer>).take(6).toList();
      });
    } catch (e) {
      if (mounted) setState(() => _error = e.toString());
    }
  }

  @override
  Widget build(BuildContext context) {
    final appState = context.watch<AppState>();
    if (_loadedForDataVersion != appState.dataVersion) {
      WidgetsBinding.instance.addPostFrameCallback((_) => _load());
    }
    final daysSinceBackup = _daysSince(appState.hotel.lastBackupAt);

    return AppScaffold(
      tab: AppTab.dashboard,
      title: appState.hotel.hotelName.isNotEmpty ? appState.hotel.hotelName : 'Hotel Dashboard',
      subtitle: 'Dashboard',
      body: _error != null
          ? ErrorState(message: _error!, onRetry: _load)
          : _stats == null
              ? const InlineLoading()
              : RefreshIndicator(
                  onRefresh: _load,
                  child: ListView(
                    padding: const EdgeInsets.fromLTRB(16, 16, 16, 96),
                    children: [
                      GridView.count(
                        crossAxisCount: 2,
                        shrinkWrap: true,
                        physics: const NeverScrollableScrollPhysics(),
                        mainAxisSpacing: 12,
                        crossAxisSpacing: 12,
                        childAspectRatio: 1.6,
                        children: [
                          _StatTile(label: 'Currently Staying', value: _stats!.currentlyStaying.toString()),
                          _StatTile(label: 'Available Rooms', value: _stats!.availableRooms.toString(), accent: true),
                          _StatTile(label: "Today's Check-ins", value: _stats!.todaysCheckIns.toString()),
                          _StatTile(label: "Today's Check-outs", value: _stats!.todaysCheckOuts.toString(), warn: true),
                        ],
                      ),
                      const SizedBox(height: 12),
                      Card(
                        child: Padding(
                          padding: const EdgeInsets.all(16),
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.stretch,
                            children: [
                              Text('${_stats!.activeGuests} total active guests'),
                              const SizedBox(height: 4),
                              Text('${_stats!.occupiedRooms} of ${_stats!.totalRooms} rooms occupied',
                                  style: TextStyle(color: Theme.of(context).colorScheme.onSurfaceVariant)),
                              const SizedBox(height: 12),
                              FilledButton(onPressed: () => context.go('/check-in'), child: const Text('New Check-In')),
                            ],
                          ),
                        ),
                      ),
                      if (daysSinceBackup == null || daysSinceBackup >= 7) ...[
                        const SizedBox(height: 12),
                        Notice(
                          kind: NoticeKind.warn,
                          message: daysSinceBackup == null
                              ? "You haven't exported a backup yet. Export one from Settings > Data."
                              : "It's been $daysSinceBackup days since your last backup. Export one from Settings > Data.",
                          action: TextButton(onPressed: () => context.go('/settings'), child: const Text('Settings')),
                        ),
                      ],
                      const SizedBox(height: 12),
                      Card(
                        child: ListTile(
                          onTap: () => context.push('/reports'),
                          title: const Text('Guest report'),
                          subtitle: const Text('Printable register for any date, as PDF'),
                          trailing: const Icon(Icons.chevron_right),
                        ),
                      ),
                      const SizedBox(height: 16),
                      Row(
                        mainAxisAlignment: MainAxisAlignment.spaceBetween,
                        children: [
                          Text('Currently Staying', style: Theme.of(context).textTheme.titleSmall),
                          TextButton(onPressed: () => context.go('/customers'), child: const Text('View all')),
                        ],
                      ),
                      if (_active.isEmpty)
                        EmptyState(
                          glyph: '🛏️',
                          title: 'No guests are staying right now',
                          action: FilledButton(onPressed: () => context.go('/check-in'), child: const Text('New Check-In')),
                        )
                      else
                        ..._active.map((c) => Card(
                              margin: const EdgeInsets.only(top: 8),
                              child: ListTile(
                                onTap: () => context.push('/customers/${c.id}'),
                                leading: CircleAvatar(child: Text(c.roomNumber, style: const TextStyle(fontSize: 11))),
                                title: Text(c.name),
                                subtitle: Text('Since ${formatTime(c.checkInDate)} · ${c.numberOfPersons} person(s)'),
                                trailing: const Icon(Icons.chevron_right),
                              ),
                            )),
                    ],
                  ),
                ),
    );
  }
}

int? _daysSince(String iso) {
  if (iso.isEmpty) return null;
  final dt = parseStoredIso(iso);
  if (dt == null) return null;
  return DateTime.now().difference(dt).inDays;
}

class _StatTile extends StatelessWidget {
  final String label;
  final String value;
  final bool accent;
  final bool warn;
  const _StatTile({required this.label, required this.value, this.accent = false, this.warn = false});

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Text(value, style: Theme.of(context).textTheme.headlineMedium?.copyWith(fontWeight: FontWeight.bold, color: scheme.primary)),
            const SizedBox(height: 4),
            Text(label, style: TextStyle(color: scheme.onSurfaceVariant, fontSize: 13)),
          ],
        ),
      ),
    );
  }
}
