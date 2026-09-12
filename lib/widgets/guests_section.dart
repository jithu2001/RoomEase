import 'dart:io';

import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../models/models.dart';
import '../services/image_service.dart';
import 'feedback.dart';

/// "Other Guests" card on the Customer Details screen — companions sharing
/// the room. Mirrors `components/GuestsSection.tsx`.
class GuestsSection extends StatelessWidget {
  final int customerId;
  final GuestCapacity capacity;
  final List<BookingGuest> guests;
  final ImageService images;
  final Future<void> Function(BookingGuest guest) onRemove;

  const GuestsSection({
    super.key,
    required this.customerId,
    required this.capacity,
    required this.guests,
    required this.images,
    required this.onRemove,
  });

  @override
  Widget build(BuildContext context) {
    if (capacity.allowed == 0 && guests.isEmpty) return const SizedBox.shrink();
    final scheme = Theme.of(context).colorScheme;
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Text('Other Guests', style: Theme.of(context).textTheme.titleSmall),
                Text('${capacity.recorded} of ${capacity.allowed} recorded',
                    style: TextStyle(color: scheme.onSurfaceVariant, fontSize: 12)),
              ],
            ),
            const SizedBox(height: 8),
            if (guests.isEmpty)
              Text(
                'This room is booked for ${capacity.persons} people. Recording the other '
                '${capacity.allowed} guest(s) is optional.',
                style: TextStyle(color: scheme.onSurfaceVariant),
              )
            else
              ...guests.map((guest) => _GuestRow(
                    customerId: customerId,
                    guest: guest,
                    images: images,
                    onRemove: () async {
                      final confirmed = await showConfirmDialog(
                        context,
                        title: 'Remove ${guest.name}?',
                        message: 'This removes their details and any ID photos from this booking. '
                            'The booking itself is not affected.',
                        confirmLabel: 'Remove',
                        danger: true,
                      );
                      if (confirmed) await onRemove(guest);
                    },
                  )),
            if (capacity.canAddMore) ...[
              const SizedBox(height: 8),
              OutlinedButton.icon(
                onPressed: () => context.push('/customers/$customerId/guests/new'),
                icon: const Icon(Icons.person_add_alt, size: 18),
                label: const Text('Add Guest'),
              ),
            ] else if (capacity.allowed > 0 && guests.isNotEmpty)
              Padding(
                padding: const EdgeInsets.only(top: 8),
                child: Text('Increase "Number of Persons" to record more guests.',
                    style: TextStyle(color: scheme.onSurfaceVariant, fontSize: 12)),
              ),
          ],
        ),
      ),
    );
  }
}

class _GuestRow extends StatelessWidget {
  final int customerId;
  final BookingGuest guest;
  final ImageService images;
  final VoidCallback onRemove;
  const _GuestRow({required this.customerId, required this.guest, required this.images, required this.onRemove});

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final hasId = guest.idFrontPath != null;
    return ListTile(
      contentPadding: EdgeInsets.zero,
      leading: hasId
          ? FutureBuilder<String?>(
              future: images.resolvePath(guest.idFrontThumbPath ?? guest.idFrontPath),
              builder: (context, snapshot) {
                final path = snapshot.data;
                return CircleAvatar(
                  radius: 22,
                  backgroundImage: path != null ? FileImage(File(path)) : null,
                  child: path == null ? Text(guest.name.isNotEmpty ? guest.name[0].toUpperCase() : '?') : null,
                );
              },
            )
          : CircleAvatar(
              radius: 22,
              backgroundColor: scheme.secondaryContainer,
              child: Text(guest.name.isNotEmpty ? guest.name[0].toUpperCase() : '?'),
            ),
      title: Text(guest.name),
      subtitle: Text('${guest.phone ?? ''}${guest.phone != null ? ' · ' : ''}${hasId ? 'ID on file' : 'No ID recorded'}'),
      trailing: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          IconButton(
            icon: const Icon(Icons.edit_outlined, size: 20),
            onPressed: () => context.push('/customers/$customerId/guests/${guest.id}/edit'),
          ),
          IconButton(icon: const Icon(Icons.close, size: 20), onPressed: onRemove),
        ],
      ),
    );
  }
}
