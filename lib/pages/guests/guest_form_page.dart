import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:provider/provider.dart';

import '../../models/models.dart';
import '../../services/guest_service.dart';
import '../../state/app_state.dart';
import '../../utils/validation.dart';
import '../../widgets/app_scaffold.dart';
import '../../widgets/feedback.dart';
import '../../widgets/id_photo_field.dart';

/// Add/edit a companion guest on a booking — mirrors `pages/Guests/GuestForm.tsx`.
class GuestFormPage extends StatefulWidget {
  final int customerId;
  final int? guestId;
  const GuestFormPage({super.key, required this.customerId, this.guestId});

  bool get isEdit => guestId != null;

  @override
  State<GuestFormPage> createState() => _GuestFormPageState();
}

class _GuestFormPageState extends State<GuestFormPage> {
  Customer? _customer;
  GuestCapacity? _capacity;
  BookingGuest? _guest;
  String? _error;

  final _nameController = TextEditingController();
  final _phoneController = TextEditingController();
  PreparedImage? _front;
  PreparedImage? _back;
  bool _submitting = false;
  FieldErrors<CustomerField> _errors = {};

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void dispose() {
    _nameController.dispose();
    _phoneController.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    final services = context.read<AppState>().services;
    try {
      final futures = <Future>[
        services.customers.get(widget.customerId),
        services.guests.capacity(widget.customerId),
      ];
      if (widget.isEdit) futures.add(services.guests.get(widget.guestId!));
      final results = await Future.wait(futures);
      if (!mounted) return;
      setState(() {
        _customer = results[0] as Customer;
        _capacity = results[1] as GuestCapacity;
        if (widget.isEdit) {
          _guest = results[2] as BookingGuest;
          _nameController.text = _guest!.name;
          _phoneController.text = _guest!.phone ?? '';
        }
      });
    } catch (e) {
      if (mounted) setState(() => _error = e.toString());
    }
  }

  Future<void> _submit() async {
    final values = GuestFormValues(name: _nameController.text, phone: _phoneController.text);
    final errors = validateGuestForm(values);
    setState(() => _errors = errors);
    if (hasErrors(errors)) return;

    setState(() => _submitting = true);
    final appState = context.read<AppState>();
    try {
      final normalised = normaliseGuestInput(values);
      if (widget.isEdit) {
        await appState.services.guests.update(widget.guestId!, normalised, GuestImages(front: _front, back: _back));
        if (!mounted) return;
        context.showSuccessToast('Guest updated');
      } else {
        await appState.services.guests.add(widget.customerId, normalised, GuestImages(front: _front, back: _back));
        if (!mounted) return;
        context.showSuccessToast('Guest added');
      }
      appState.invalidateData();
      if (!mounted) return;
      context.go('/customers/${widget.customerId}');
    } catch (e) {
      if (mounted) context.showErrorToast(e);
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final appState = context.watch<AppState>();
    final full = !widget.isEdit && _capacity != null && !_capacity!.canAddMore;
    return AppScaffold(
      tab: AppTab.customers,
      title: widget.isEdit ? 'Edit Guest' : 'Add Guest',
      subtitle: _customer?.customerCode,
      showBack: true,
      body: _error != null
          ? ErrorState(message: _error!, onRetry: _load)
          : _customer == null || _capacity == null
              ? const InlineLoading()
              : SingleChildScrollView(
                  padding: const EdgeInsets.all(16),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      Padding(
                        padding: const EdgeInsets.only(bottom: 12),
                        child: full
                            ? Notice(
                                kind: NoticeKind.warn,
                                message:
                                    'This booking already has all ${_capacity!.allowed} other guest(s) recorded. Increase '
                                    '"Number of Persons" on the booking to add more.',
                              )
                            : Notice(message: 'Sharing room ${_customer!.roomNumber} with ${_customer!.name}.'),
                      ),
                      Card(
                        child: Padding(
                          padding: const EdgeInsets.all(16),
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.stretch,
                            children: [
                              TextFormField(
                                controller: _nameController,
                                textCapitalization: TextCapitalization.words,
                                maxLength: 80,
                                decoration: InputDecoration(labelText: 'Guest Name', errorText: _errors[CustomerField.name]),
                              ),
                              TextFormField(
                                controller: _phoneController,
                                keyboardType: TextInputType.phone,
                                maxLength: 20,
                                decoration: InputDecoration(
                                  labelText: 'Phone Number',
                                  helperText: _errors[CustomerField.phone] == null ? 'Leave blank if they have no separate number.' : null,
                                  errorText: _errors[CustomerField.phone],
                                ),
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
                              Text('ID Proof (optional)', style: Theme.of(context).textTheme.titleSmall),
                              const SizedBox(height: 12),
                              IdPhotoField(
                                label: 'ID Front',
                                images: appState.services.images,
                                required: false,
                                existingPath: _guest?.idFrontPath,
                                existingThumbPath: _guest?.idFrontThumbPath,
                                onChanged: (image) => setState(() => _front = image),
                              ),
                              const SizedBox(height: 16),
                              IdPhotoField(
                                label: 'ID Back',
                                images: appState.services.images,
                                required: false,
                                existingPath: _guest?.idBackPath,
                                existingThumbPath: _guest?.idBackThumbPath,
                                onChanged: (image) => setState(() => _back = image),
                              ),
                            ],
                          ),
                        ),
                      ),
                      const SizedBox(height: 20),
                      FilledButton(
                        onPressed: _submitting || full ? null : _submit,
                        child: _submitting
                            ? const SizedBox(width: 20, height: 20, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
                            : Text(widget.isEdit ? 'Save Changes' : 'Add Guest'),
                      ),
                    ],
                  ),
                ),
    );
  }
}
