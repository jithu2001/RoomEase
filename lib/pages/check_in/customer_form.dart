import 'package:flutter/material.dart';

import '../../models/models.dart';
import '../../services/services.dart';
import '../../utils/app_date.dart';
import '../../utils/app_error.dart';
import '../../utils/money.dart';
import '../../utils/validation.dart';
import '../../widgets/date_time_field.dart';
import '../../widgets/feedback.dart';
import '../../widgets/id_photo_field.dart';
import '../../widgets/room_select.dart';

/// Shared check-in / edit form — mirrors `pages/CheckIn/CustomerForm.tsx`.
/// Used by both the Check-In screen (create) and Edit Customer screen (edit).
class CustomerForm extends StatefulWidget {
  final Services services;
  final Customer? existing;
  /// A returning guest whose details/photos are being reused (create mode only).
  final Customer? reuseFrom;
  final VoidCallback? onClearReuse;
  final String submitLabel;
  final Future<void> Function(NormalisedCustomerForm values, {PreparedImage? front, PreparedImage? back}) onSubmit;
  /// Called when photo reuse fails because the source file is gone — lets
  /// the Check-In screen clear its reuse state and ask for fresh photos.
  final VoidCallback? onReuseMissingFile;

  const CustomerForm({
    super.key,
    required this.services,
    this.existing,
    this.reuseFrom,
    this.onClearReuse,
    required this.submitLabel,
    required this.onSubmit,
    this.onReuseMissingFile,
  });

  @override
  State<CustomerForm> createState() => _CustomerFormState();
}

class _CustomerFormState extends State<CustomerForm> {
  late final _nameController = TextEditingController(text: widget.existing?.name ?? widget.reuseFrom?.name ?? '');
  late final _addressController = TextEditingController(text: widget.existing?.address ?? widget.reuseFrom?.address ?? '');
  late final _phoneController = TextEditingController(text: widget.existing?.phone ?? widget.reuseFrom?.phone ?? '');
  late final _personsController = TextEditingController(text: (widget.existing?.numberOfPersons ?? 1).toString());
  late final _amountController = TextEditingController(text: minorToInput(widget.existing?.amountMinor));

  late DateTime? _checkInAt = widget.existing != null ? parseStoredIso(widget.existing!.checkInDate) : DateTime.now();
  late DateTime? _checkOutAt = widget.existing != null ? parseStoredIso(widget.existing!.checkOutDate) : null;
  late String? _roomNumber = widget.existing?.roomNumber;

  PreparedImage? _front;
  PreparedImage? _back;
  bool _submitting = false;
  FieldErrors<CustomerField> _errors = {};

  List<RoomStatus>? _rooms;

  bool get _isEdit => widget.existing != null;
  bool get _canEditCheckOut => _isEdit && widget.existing!.status == CustomerStatus.checkedOut;

  @override
  void initState() {
    super.initState();
    _loadRooms();
  }

  @override
  void didUpdateWidget(CustomerForm oldWidget) {
    super.didUpdateWidget(oldWidget);
    // The controllers above are built once, on the form's first frame — when
    // no returning guest has been picked yet. Picking one later only swaps in
    // a new widget, so the reused details have to be pushed into the fields
    // here or they'd never appear.
    final reuse = widget.reuseFrom;
    if (reuse == null || reuse.id == oldWidget.reuseFrom?.id) return;
    _nameController.text = reuse.name;
    _addressController.text = reuse.address;
    _phoneController.text = reuse.phone;
    // A rebuild is already in flight, so mutate directly rather than
    // setState: clearing stale errors for the fields we just refilled.
    _errors = Map.of(_errors)
      ..remove(CustomerField.name)
      ..remove(CustomerField.address)
      ..remove(CustomerField.phone);
  }

  Future<void> _loadRooms() async {
    final rooms = await widget.services.rooms.listAvailable(keepRoom: widget.existing?.roomNumber);
    if (mounted) setState(() => _rooms = rooms);
  }

  @override
  void dispose() {
    _nameController.dispose();
    _addressController.dispose();
    _phoneController.dispose();
    _personsController.dispose();
    _amountController.dispose();
    super.dispose();
  }

  bool get _hasFrontPhoto => _front != null || (widget.existing?.idFrontPath.isNotEmpty ?? false) || widget.reuseFrom != null;
  bool get _hasBackPhoto => _back != null || (widget.existing?.idBackPath.isNotEmpty ?? false) || widget.reuseFrom != null;

  Future<void> _submit() async {
    final values = CustomerFormValues(
      name: _nameController.text,
      address: _addressController.text,
      phone: _phoneController.text,
      roomNumber: _roomNumber ?? '',
      numberOfPersonsText: _personsController.text,
      amountText: _amountController.text,
      checkInAt: _checkInAt,
      checkOutAt: _checkOutAt,
    );
    final errors = validateCustomerForm(
      values,
      hasIdFront: _hasFrontPhoto,
      hasIdBack: _hasBackPhoto,
      canEditCheckOut: _canEditCheckOut,
    );
    setState(() => _errors = errors);
    if (hasErrors(errors)) return;

    setState(() => _submitting = true);
    try {
      final normalised = normaliseCustomerInput(values);
      await widget.onSubmit(normalised, front: _front, back: _back);
    } catch (e) {
      if (!mounted) return;
      if (e is AppError && e.code == AppErrorCode.missingFile && widget.reuseFrom != null) {
        widget.onReuseMissingFile?.call();
      }
      context.showErrorToast(e);
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return SingleChildScrollView(
      padding: const EdgeInsets.all(16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          if (widget.reuseFrom != null)
            Padding(
              padding: const EdgeInsets.only(bottom: 12),
              child: Notice(
                message: 'Reusing details from a previous stay by ${widget.reuseFrom!.name}.',
                action: TextButton(onPressed: widget.onClearReuse, child: const Text('Clear')),
              ),
            ),
          _SectionCard(
            title: 'Customer Information',
            children: [
              TextFormField(
                controller: _nameController,
                textCapitalization: TextCapitalization.words,
                maxLength: 80,
                decoration: InputDecoration(labelText: 'Name', errorText: _errors[CustomerField.name]),
              ),
              TextFormField(
                controller: _addressController,
                maxLines: 3,
                maxLength: 250,
                decoration: InputDecoration(labelText: 'Address', errorText: _errors[CustomerField.address]),
              ),
              TextFormField(
                controller: _phoneController,
                keyboardType: TextInputType.phone,
                maxLength: 20,
                decoration: InputDecoration(labelText: 'Phone', errorText: _errors[CustomerField.phone]),
              ),
            ],
          ),
          const SizedBox(height: 12),
          _SectionCard(
            title: 'This Stay',
            children: [
              TextFormField(
                controller: _personsController,
                keyboardType: TextInputType.number,
                decoration: InputDecoration(labelText: 'Number of Persons', errorText: _errors[CustomerField.numberOfPersons]),
              ),
              DateTimeField(
                label: 'Check-in Date & Time',
                value: _checkInAt,
                onChanged: (v) => setState(() => _checkInAt = v),
                errorText: _errors[CustomerField.checkIn],
                hintText: 'Change it if the guest arrived earlier.',
              ),
              if (_canEditCheckOut)
                DateTimeField(
                  label: 'Check-out Date & Time',
                  value: _checkOutAt,
                  onChanged: (v) => setState(() => _checkOutAt = v),
                  errorText: _errors[CustomerField.checkOut],
                ),
              TextFormField(
                controller: _amountController,
                keyboardType: const TextInputType.numberWithOptions(decimal: true),
                decoration: InputDecoration(
                  labelText: 'Amount',
                  prefixText: '$currencySymbol ',
                  hintText: 'e.g. 1500',
                  errorText: _errors[CustomerField.amount],
                ),
              ),
            ],
          ),
          const SizedBox(height: 12),
          _SectionCard(
            title: 'Room',
            children: [
              if (_rooms == null)
                const Padding(padding: EdgeInsets.symmetric(vertical: 12), child: Center(child: CircularProgressIndicator()))
              else
                RoomSelect(
                  rooms: _rooms!,
                  selected: _roomNumber,
                  keepRoom: widget.existing?.roomNumber,
                  onSelected: (room) => setState(() => _roomNumber = room),
                ),
              if (_errors[CustomerField.roomNumber] != null)
                Padding(
                  padding: const EdgeInsets.only(top: 6),
                  child: Text(_errors[CustomerField.roomNumber]!, style: TextStyle(color: Theme.of(context).colorScheme.error, fontSize: 12)),
                ),
            ],
          ),
          const SizedBox(height: 12),
          _SectionCard(
            title: 'ID Proof',
            children: [
              Text(
                widget.reuseFrom != null
                    ? 'These are the photos already on file. Retake only if they need updating.'
                    : 'Photos are resized to about 800×600 and stored only on this device.',
                style: TextStyle(color: Theme.of(context).colorScheme.onSurfaceVariant, fontSize: 12),
              ),
              const SizedBox(height: 12),
              IdPhotoField(
                label: 'ID Front',
                images: widget.services.images,
                existingPath: widget.existing?.idFrontPath ?? widget.reuseFrom?.idFrontPath,
                existingThumbPath: widget.existing?.idFrontThumbPath ?? widget.reuseFrom?.idFrontThumbPath,
                onChanged: (image) => setState(() => _front = image),
              ),
              const SizedBox(height: 16),
              IdPhotoField(
                label: 'ID Back',
                images: widget.services.images,
                existingPath: widget.existing?.idBackPath ?? widget.reuseFrom?.idBackPath,
                existingThumbPath: widget.existing?.idBackThumbPath ?? widget.reuseFrom?.idBackThumbPath,
                onChanged: (image) => setState(() => _back = image),
              ),
            ],
          ),
          const SizedBox(height: 20),
          FilledButton(
            onPressed: _submitting ? null : _submit,
            child: _submitting
                ? const SizedBox(width: 20, height: 20, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
                : Text(widget.submitLabel),
          ),
          const SizedBox(height: 24),
        ],
      ),
    );
  }
}

class _SectionCard extends StatelessWidget {
  final String title;
  final List<Widget> children;
  const _SectionCard({required this.title, required this.children});

  @override
  Widget build(BuildContext context) {
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text(title, style: Theme.of(context).textTheme.titleSmall),
            const SizedBox(height: 12),
            for (final child in children) Padding(padding: const EdgeInsets.only(bottom: 12), child: child),
          ],
        ),
      ),
    );
  }
}
