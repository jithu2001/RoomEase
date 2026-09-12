import 'package:flutter/material.dart';

import '../models/models.dart';

/// Visual room picker grid — mirrors `components/RoomSelect.tsx`. Shows every
/// room, not just free ones: occupied rooms stay visible but disabled
/// (deliberately, per the original — "faster for staff than hiding them"),
/// with a tooltip naming the current occupant.
class RoomSelect extends StatelessWidget {
  final List<RoomStatus> rooms;
  final String? selected;
  /// The record's own current room, kept selectable even if occupied
  /// (lets an in-place edit not force a room change).
  final String? keepRoom;
  final ValueChanged<String> onSelected;

  const RoomSelect({super.key, required this.rooms, required this.selected, required this.keepRoom, required this.onSelected});

  @override
  Widget build(BuildContext context) {
    if (rooms.isEmpty) {
      return Text(
        'No rooms configured yet. Add one from Rooms in the bottom navigation.',
        style: TextStyle(color: Theme.of(context).colorScheme.onSurfaceVariant),
      );
    }
    final available = rooms.where((r) => !r.occupied || r.roomNumber == keepRoom).length;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Wrap(
          spacing: 8,
          runSpacing: 8,
          children: rooms.map((room) {
            final isKept = room.roomNumber == keepRoom;
            final disabled = room.occupied && !isKept;
            final isSelected = room.roomNumber == selected;
            final chip = ChoiceChip(
              label: Text(room.roomNumber),
              selected: isSelected,
              onSelected: disabled ? null : (_) => onSelected(room.roomNumber),
              tooltip: disabled ? 'Occupied by ${room.customerName ?? 'a guest'}' : (isKept ? 'Current room' : 'Free'),
              avatar: disabled ? const Icon(Icons.lock_outline, size: 16) : null,
            );
            return disabled ? Opacity(opacity: 0.55, child: chip) : chip;
          }).toList(),
        ),
        const SizedBox(height: 6),
        Text('$available of ${rooms.length} rooms available',
            style: Theme.of(context).textTheme.bodySmall?.copyWith(color: Theme.of(context).colorScheme.onSurfaceVariant)),
      ],
    );
  }
}
