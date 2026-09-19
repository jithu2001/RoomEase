import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../state/app_state.dart';
import '../../widgets/feedback.dart';

/// "Hotel Information" section — the name, address and phone that appear on
/// reports and in the WhatsApp welcome message.
class HotelInfoSettings extends StatefulWidget {
  const HotelInfoSettings({super.key});

  @override
  State<HotelInfoSettings> createState() => _HotelInfoSettingsState();
}

class _HotelInfoSettingsState extends State<HotelInfoSettings> {
  final _nameController = TextEditingController();
  final _addressController = TextEditingController();
  final _phoneController = TextEditingController();
  bool _saving = false;
  bool _initialised = false;

  void _syncControllers(AppState appState) {
    if (_initialised) return;
    _initialised = true;
    _nameController.text = appState.hotel.hotelName;
    _addressController.text = appState.hotel.hotelAddress;
    _phoneController.text = appState.hotel.hotelPhone;
  }

  @override
  void dispose() {
    _nameController.dispose();
    _addressController.dispose();
    _phoneController.dispose();
    super.dispose();
  }

  Future<void> _save() async {
    setState(() => _saving = true);
    final appState = context.read<AppState>();
    try {
      await appState.services.settings.saveHotelInfo(
        hotelName: _nameController.text,
        hotelAddress: _addressController.text,
        hotelPhone: _phoneController.text,
      );
      await appState.reloadHotel();
      if (mounted) context.showSuccessToast('Hotel information saved');
    } catch (e) {
      if (mounted) context.showErrorToast(e);
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final appState = context.watch<AppState>();
    _syncControllers(appState);
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text(
              'Shown on reports and used in the WhatsApp welcome message.',
              style: Theme.of(context).textTheme.bodySmall?.copyWith(
                    color: Theme.of(context).colorScheme.onSurfaceVariant,
                  ),
            ),
            const SizedBox(height: 12),
            TextField(controller: _nameController, maxLength: 80, decoration: const InputDecoration(labelText: 'Hotel name')),
            TextField(controller: _addressController, maxLines: 3, maxLength: 250, decoration: const InputDecoration(labelText: 'Address')),
            TextField(controller: _phoneController, keyboardType: TextInputType.phone, maxLength: 20, decoration: const InputDecoration(labelText: 'Phone')),
            const SizedBox(height: 8),
            FilledButton(onPressed: _saving ? null : _save, child: const Text('Save Hotel Information')),
          ],
        ),
      ),
    );
  }
}
