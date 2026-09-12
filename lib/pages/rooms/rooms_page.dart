import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:provider/provider.dart';

import '../../models/models.dart';
import '../../state/app_state.dart';
import '../../utils/validation.dart';
import '../../widgets/app_scaffold.dart';
import '../../widgets/feedback.dart';

class RoomsPage extends StatefulWidget {
  const RoomsPage({super.key});

  @override
  State<RoomsPage> createState() => _RoomsPageState();
}

class _RoomsPageState extends State<RoomsPage> {
  final _controller = TextEditingController();
  List<RoomStatus>? _rooms;
  String? _error;
  String? _fieldError;
  bool _saving = false;

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    setState(() => _error = null);
    final appState = context.read<AppState>();
    try {
      final rooms = await appState.services.rooms.listStatus();
      if (mounted) setState(() => _rooms = rooms);
    } catch (e) {
      if (mounted) setState(() => _error = e.toString());
    }
  }

  Future<void> _addRoom() async {
    final value = _controller.text;
    final existing = _rooms?.map((r) => r.roomNumber).toList() ?? [];
    final error = validateNewRoomNumber(value, existing);
    setState(() => _fieldError = error);
    if (error != null) return;

    setState(() => _saving = true);
    final appState = context.read<AppState>();
    try {
      final room = await appState.services.rooms.add(value);
      _controller.clear();
      await _load();
      appState.invalidateData();
      if (mounted) context.showSuccessToast('Room ${room.roomNumber} added');
    } catch (e) {
      if (mounted) context.showErrorToast(e);
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  Future<void> _removeRoom(String roomNumber) async {
    final confirmed = await showConfirmDialog(
      context,
      title: 'Remove room $roomNumber?',
      message: 'The room will no longer be available for new check-ins. Past customer records that used this room are kept.',
      confirmLabel: 'Remove',
      danger: true,
    );
    if (!confirmed || !mounted) return;
    final appState = context.read<AppState>();
    try {
      await appState.services.rooms.remove(roomNumber);
      await _load();
      appState.invalidateData();
    } catch (e) {
      if (mounted) context.showErrorToast(e);
    }
  }

  @override
  Widget build(BuildContext context) {
    final rooms = _rooms;
    final available = rooms?.where((r) => !r.occupied).toList() ?? [];
    final occupied = rooms?.where((r) => r.occupied).toList() ?? [];
    return AppScaffold(
      tab: AppTab.rooms,
      title: 'Rooms',
      subtitle: rooms != null ? '${available.length} of ${rooms.length} free' : null,
      body: _error != null
          ? ErrorState(message: _error!, onRetry: _load)
          : rooms == null
              ? const InlineLoading()
              : ListView(
                  padding: const EdgeInsets.fromLTRB(16, 16, 16, 96),
                  children: [
                    Card(
                      child: Padding(
                        padding: const EdgeInsets.all(16),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.stretch,
                          children: [
                            Text('Add a room', style: Theme.of(context).textTheme.titleSmall),
                            const SizedBox(height: 12),
                            Row(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Expanded(
                                  child: TextField(
                                    controller: _controller,
                                    maxLength: 10,
                                    decoration: InputDecoration(labelText: 'Room number', errorText: _fieldError, counterText: ''),
                                    onSubmitted: (_) => _addRoom(),
                                  ),
                                ),
                                const SizedBox(width: 12),
                                FilledButton(
                                  onPressed: _saving || _controller.text.trim().isEmpty ? null : _addRoom,
                                  child: const Text('Add'),
                                ),
                              ],
                            ),
                          ],
                        ),
                      ),
                    ),
                    if (rooms.isEmpty)
                      const EmptyState(glyph: '🚪', title: 'No rooms configured')
                    else ...[
                      const SizedBox(height: 20),
                      Text('Available (${available.length})', style: Theme.of(context).textTheme.titleSmall),
                      ...available.map((room) => Card(
                            margin: const EdgeInsets.only(top: 8),
                            child: ListTile(
                              title: Text('Room ${room.roomNumber}'),
                              subtitle: const Text('Free — ready for a new check-in'),
                              trailing: TextButton(onPressed: () => _removeRoom(room.roomNumber), child: const Text('Remove')),
                            ),
                          )),
                      const SizedBox(height: 20),
                      Text('Occupied (${occupied.length})', style: Theme.of(context).textTheme.titleSmall),
                      ...occupied.map((room) => Card(
                            margin: const EdgeInsets.only(top: 8),
                            child: ListTile(
                              onTap: () => context.push('/customers?q=${room.roomNumber}'),
                              title: Text(room.customerName ?? ''),
                              subtitle: Text('Room ${room.roomNumber} · ${room.customerCode ?? ''}'),
                              trailing: const Chip(label: Text('In', style: TextStyle(fontSize: 11)), visualDensity: VisualDensity.compact),
                            ),
                          )),
                    ],
                  ],
                ),
    );
  }
}
