import 'dart:async';

import 'package:flutter/material.dart';

import '../models/models.dart';
import '../services/customer_service.dart';
import '../theme/app_theme.dart';
import '../theme/motion.dart';
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
            AnimatedSize(
              duration: AppMotion.duration,
              curve: AppMotion.curve,
              alignment: Alignment.topCenter,
              child: _results == null
                  ? const SizedBox(width: double.infinity)
                  : Padding(
                      padding: const EdgeInsets.only(top: 8),
                      child: _results!.isEmpty
                          ? Text('No previous guest found. Fill in the details below as a new guest.',
                              style: TextStyle(color: scheme.onSurfaceVariant))
                          : Column(
                              children: _results!
                                  .asMap()
                                  .entries
                                  .map((entry) => StaggeredEntrance(
                                        index: entry.key,
                                        child: Card(
                                          margin: const EdgeInsets.only(top: 6),
                                          color: scheme.surfaceContainerHighest.withValues(alpha: 0.35),
                                          child: ListTile(
                                            title: Text(entry.value.name),
                                            subtitle: Text(
                                                '${entry.value.phone} · ${entry.value.stayCount} stay(s) · last ${formatDate(entry.value.lastStay)}'),
                                            trailing: Chip(
                                              label: Text(entry.value.hasIdPhotos ? 'ID on file' : 'No ID',
                                                  style: const TextStyle(fontSize: 11)),
                                              backgroundColor: entry.value.hasIdPhotos
                                                  ? context.statusColors.successContainer
                                                  : scheme.surfaceContainerHighest,
                                              labelStyle: TextStyle(
                                                  color: entry.value.hasIdPhotos
                                                      ? context.statusColors.onSuccessContainer
                                                      : scheme.onSurfaceVariant),
                                              visualDensity: VisualDensity.compact,
                                            ),
                                            onTap: () => widget.onSelect(entry.value),
                                          ),
                                        ),
                                      ))
                                  .toList(),
                            ),
                    ),
            ),
          ],
        ),
      ),
    );
  }
}
