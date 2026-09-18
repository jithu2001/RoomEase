import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:provider/provider.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../models/models.dart';
import '../../state/app_state.dart';
import '../../theme/app_theme.dart';
import '../../utils/app_date.dart';
import '../../utils/money.dart';
import '../../utils/phone.dart';
import '../../widgets/app_scaffold.dart';
import '../../widgets/feedback.dart';
import '../../widgets/guests_section.dart';
import '../../widgets/id_photo_viewer.dart';
import '../../widgets/whatsapp_welcome_sheet.dart';

class CustomerDetailsPage extends StatefulWidget {
  final int customerId;
  const CustomerDetailsPage({super.key, required this.customerId});

  @override
  State<CustomerDetailsPage> createState() => _CustomerDetailsPageState();
}

class _CustomerDetailsPageState extends State<CustomerDetailsPage> {
  Customer? _customer;
  GuestCapacity? _capacity;
  List<BookingGuest> _guests = const [];
  String? _error;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() => _error = null);
    final services = context.read<AppState>().services;
    try {
      final results = await Future.wait([
        services.customers.get(widget.customerId),
        services.guests.capacity(widget.customerId),
        services.guests.list(widget.customerId),
      ]);
      if (!mounted) return;
      setState(() {
        _customer = results[0] as Customer;
        _capacity = results[1] as GuestCapacity;
        _guests = results[2] as List<BookingGuest>;
      });
    } catch (e) {
      if (mounted) setState(() => _error = e.toString());
    }
  }

  Future<void> _checkOut() async {
    final customer = _customer!;
    final confirmed = await showConfirmDialog(
      context,
      title: 'Check out this customer?',
      message: 'Are you sure you want to check out ${customer.name} from room ${customer.roomNumber}? '
          'The record is kept and the room becomes available again.',
      confirmLabel: 'Check Out',
    );
    if (!confirmed || !mounted) return;
    final appState = context.read<AppState>();
    try {
      final updated = await appState.services.customers.checkOut(customer.id);
      if (!mounted) return;
      setState(() => _customer = updated);
      appState.invalidateData();
      // ignore: use_build_context_synchronously
      context.showSuccessToast('Room ${customer.roomNumber} is now available');
    } catch (e) {
      if (mounted) context.showErrorToast(e);
    }
  }

  Future<void> _delete() async {
    final customer = _customer!;
    final confirmed = await showConfirmDialog(
      context,
      title: 'Delete customer?',
      message: 'This will permanently remove the customer record and associated ID photos from this device. '
          'This cannot be undone.',
      confirmLabel: 'Delete',
      danger: true,
    );
    if (!confirmed || !mounted) return;
    final appState = context.read<AppState>();
    try {
      await appState.services.customers.remove(customer.id);
      appState.invalidateData();
      if (!mounted) return;
      // ignore: use_build_context_synchronously
      context.showSuccessToast('Customer record deleted');
      // ignore: use_build_context_synchronously
      context.go('/customers');
    } catch (e) {
      if (mounted) context.showErrorToast(e);
    }
  }

  Future<void> _removeGuest(BookingGuest guest) async {
    final appState = context.read<AppState>();
    try {
      await appState.services.guests.remove(guest.id);
      await _load();
    } catch (e) {
      if (mounted) context.showErrorToast(e);
    }
  }

  @override
  Widget build(BuildContext context) {
    final appState = context.watch<AppState>();
    final customer = _customer;
    return AppScaffold(
      tab: AppTab.customers,
      title: customer?.name ?? 'Customer',
      subtitle: customer?.customerCode,
      showBack: true,
      body: _error != null
          ? ErrorState(message: _error!, onRetry: _load)
          : customer == null
              ? const InlineLoading()
              : RefreshIndicator(
                  onRefresh: _load,
                  child: ListView(
                    padding: const EdgeInsets.all(16),
                    children: [
                      _DetailsCard(customer: customer),
                      const SizedBox(height: 12),
                      if (_capacity != null)
                        GuestsSection(
                          customerId: customer.id,
                          capacity: _capacity!,
                          guests: _guests,
                          images: appState.services.images,
                          onRemove: _removeGuest,
                        ),
                      const SizedBox(height: 12),
                      Card(
                        child: Padding(
                          padding: const EdgeInsets.all(16),
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.stretch,
                            children: [
                              Text('ID Proof', style: Theme.of(context).textTheme.titleSmall),
                              const SizedBox(height: 12),
                              IdPhotoViewer(
                                images: appState.services.images,
                                frontPath: customer.idFrontPath,
                                frontThumbPath: customer.idFrontThumbPath,
                                backPath: customer.idBackPath,
                                backThumbPath: customer.idBackThumbPath,
                              ),
                              const SizedBox(height: 6),
                              Text('Tap a photo to open it full screen.',
                                  style: TextStyle(color: Theme.of(context).colorScheme.onSurfaceVariant, fontSize: 12)),
                            ],
                          ),
                        ),
                      ),
                      const SizedBox(height: 16),
                      Row(
                        children: [
                          Expanded(
                            child: OutlinedButton(
                              onPressed: () => context.push('/customers/${customer.id}/edit'),
                              child: const Text('Edit'),
                            ),
                          ),
                          if (customer.status == CustomerStatus.checkedIn) ...[
                            const SizedBox(width: 12),
                            Expanded(child: FilledButton(onPressed: _checkOut, child: const Text('Check Out'))),
                          ],
                        ],
                      ),
                      const SizedBox(height: 12),
                      SizedBox(
                        width: double.infinity,
                        child: FilledButton.tonal(
                          onPressed: _delete,
                          style: FilledButton.styleFrom(
                            backgroundColor: Theme.of(context).colorScheme.errorContainer,
                            foregroundColor: Theme.of(context).colorScheme.onErrorContainer,
                          ),
                          child: const Text('Delete Customer'),
                        ),
                      ),
                    ],
                  ),
                ),
    );
  }
}

class _DetailsCard extends StatelessWidget {
  final Customer customer;
  const _DetailsCard({required this.customer});

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final status = context.statusColors;
    final checkedIn = customer.status == CustomerStatus.checkedIn;
    final appState = context.watch<AppState>();
    final canWhatsApp = appState.hotel.whatsappEnabled &&
        whatsappNumber(customer.phone, defaultCountryCode: appState.hotel.whatsappCountryCode) != null;
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Chip(label: Text('Room ${customer.roomNumber}'), visualDensity: VisualDensity.compact),
                const Spacer(),
                Chip(
                  label: Text(checkedIn ? 'Checked In' : 'Checked Out', style: const TextStyle(fontSize: 12)),
                  backgroundColor: checkedIn ? status.successContainer : scheme.surfaceContainerHighest,
                  labelStyle: TextStyle(color: checkedIn ? status.onSuccessContainer : scheme.onSurfaceVariant),
                  visualDensity: VisualDensity.compact,
                ),
              ],
            ),
            const Divider(height: 24),
            _Row('Customer Code', customer.customerCode, mono: true),
            _Row('Name', customer.name),
            _Row('Address', customer.address),
            _RowTappable(
              'Phone',
              customer.phone,
              onTap: () => launchUrl(Uri.parse('tel:${customer.phone}')),
              trailing: canWhatsApp
                  ? IconButton(
                      icon: const Icon(Icons.chat_bubble_outline),
                      tooltip: 'Send WhatsApp welcome',
                      visualDensity: VisualDensity.compact,
                      onPressed: () => offerWhatsAppWelcome(
                        context,
                        service: appState.services.whatsapp,
                        customer: customer,
                        enabled: true,
                      ),
                    )
                  : null,
            ),
            _Row('Number of Persons', customer.numberOfPersons.toString()),
            _Row('Amount', formatMinor(customer.amountMinor)),
            _Row('Checked In', formatDateTime(customer.checkInDate)),
            _Row('Checked Out', customer.checkOutDate != null ? formatDateTime(customer.checkOutDate) : 'Still staying'),
            _Row('Nights', nightsBetween(customer.checkInDate, customer.checkOutDate).toString()),
          ],
        ),
      ),
    );
  }
}

class _Row extends StatelessWidget {
  final String label;
  final String value;
  final bool mono;
  const _Row(this.label, this.value, {this.mono = false});

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 6),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          SizedBox(width: 140, child: Text(label, style: TextStyle(color: Theme.of(context).colorScheme.onSurfaceVariant))),
          Expanded(child: Text(value, style: mono ? const TextStyle(fontFamily: 'monospace') : null)),
        ],
      ),
    );
  }
}

class _RowTappable extends StatelessWidget {
  final String label;
  final String value;
  final VoidCallback onTap;
  final Widget? trailing;
  const _RowTappable(this.label, this.value, {required this.onTap, this.trailing});

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 6),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          SizedBox(width: 140, child: Text(label, style: TextStyle(color: Theme.of(context).colorScheme.onSurfaceVariant))),
          Expanded(
            child: InkWell(
              onTap: onTap,
              child: Text(value, style: TextStyle(color: Theme.of(context).colorScheme.primary, decoration: TextDecoration.underline)),
            ),
          ),
          ?trailing,
        ],
      ),
    );
  }
}
