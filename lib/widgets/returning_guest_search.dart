import 'dart:async';

import 'package:flutter/material.dart';

import '../models/models.dart';
import '../services/customer_service.dart';
import '../theme/app_theme.dart';
import '../utils/app_date.dart';

/// Search-by-phone/name box on the Check-In screen for reusing a previous
/// guest's details and ID photos — mirrors `components/ReturningGuestSearch.tsx`.
class ReturningGuestSearch extends StatefulWidget {
  final CustomerService customers;
  final ValueChanged<GuestMatch> onSelect;
  const ReturningGuestSearch({super.key, required this.customers, required this.onSelect});

  @override
  State<ReturningGuestSearch> createState() => _ReturningGuestSearchState();
}

class _ReturningGuestSearchState extends State<ReturningGuestSearch> {
  final _controller = TextEditingController();
  Timer? _debounce;
  List<GuestMatch>? _results;

  @override
  void dispose() {
    _debounce?.cancel();
    _controller.dispose();
    super.dispose();
  }

  void _onChanged(String value) {
    _debounce?.cancel();
    if (value.trim().length < 3) {
      setState(() => _results = null);
      return;
    }
    _debounce = Timer(const Duration(milliseconds: 250), () async {
      try {
        final matches = await widget.customers.findReturningGuests(value);
        if (!mounted) return;
        setState(() => _results = matches);
      } catch (_) {
        if (!mounted) return;
        setState(() => _results = const []);
      }
    });
  }

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text('Returning guest?', style: Theme.of(context).textTheme.titleSmall),
            const SizedBox(height: 8),
            TextField(
              controller: _controller,
              keyboardType: TextInputType.phone,
              onChanged: _onChanged,
              decoration: const InputDecoration(
                hintText: 'Phone number or name',
                prefixIcon: Icon(Icons.search),
                isDense: true,
              ),
            ),
            if (_results != null) ...[
              const SizedBox(height: 8),
              if (_results!.isEmpty)
                Text('No previous guest found. Fill in the details below as a new guest.',
                    style: TextStyle(color: scheme.onSurfaceVariant))
              else
                ..._results!.map((match) => Card(
                      margin: const EdgeInsets.only(top: 6),
                      color: scheme.surfaceContainerHighest.withValues(alpha: 0.35),
                      child: ListTile(
                        title: Text(match.name),
                        subtitle: Text('${match.phone} · ${match.stayCount} stay(s) · last ${formatDate(match.lastStay)}'),
                        trailing: Chip(
                          label: Text(match.hasIdPhotos ? 'ID on file' : 'No ID', style: const TextStyle(fontSize: 11)),
                          backgroundColor: match.hasIdPhotos ? context.statusColors.successContainer : scheme.surfaceContainerHighest,
                          labelStyle: TextStyle(color: match.hasIdPhotos ? context.statusColors.onSuccessContainer : scheme.onSurfaceVariant),
                          visualDensity: VisualDensity.compact,
                        ),
                        onTap: () => widget.onSelect(match),
                      ),
                    )),
            ],
          ],
        ),
      ),
    );
  }
}
