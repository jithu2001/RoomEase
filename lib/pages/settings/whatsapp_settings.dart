import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:provider/provider.dart';

import '../../state/app_state.dart';
import '../../utils/message_template.dart';
import '../../widgets/feedback.dart';

/// Sample values for the live preview, so staff can see the shape of the
/// message without checking anyone in.
const _sample = {
  'guest': 'Anita Menon',
  'room': '102',
  'checkin': '18 Sep 2026, 2:30 PM',
  'code': 'CUS-0042',
};

/// "WhatsApp Welcome" section embedded in Settings.
class WhatsAppSettings extends StatefulWidget {
  const WhatsAppSettings({super.key});

  @override
  State<WhatsAppSettings> createState() => _WhatsAppSettingsState();
}

class _WhatsAppSettingsState extends State<WhatsAppSettings> {
  final _codeController = TextEditingController();
  final _templateController = TextEditingController();
  bool _enabled = true;
  bool _initialised = false;
  bool _saving = false;

  void _syncControllers(AppState appState) {
    if (_initialised) return;
    _initialised = true;
    _enabled = appState.hotel.whatsappEnabled;
    _codeController.text = appState.hotel.whatsappCountryCode;
    _templateController.text = appState.hotel.whatsappWelcomeTemplate;
  }

  @override
  void dispose() {
    _codeController.dispose();
    _templateController.dispose();
    super.dispose();
  }

  Future<void> _save() async {
    setState(() => _saving = true);
    final appState = context.read<AppState>();
    try {
      await appState.services.settings.saveWhatsAppSettings(
        enabled: _enabled,
        countryCode: _codeController.text,
        template: _templateController.text,
      );
      await appState.reloadHotel();
      if (mounted) context.showSuccessToast('WhatsApp settings saved');
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
    final theme = Theme.of(context);
    final preview = renderTemplate(_templateController.text, {
      ..._sample,
      'hotel': appState.hotel.hotelName,
      'hotel_phone': appState.hotel.hotelPhone,
    });

    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text(
              'After a check-in, RoomEase can open WhatsApp with this message ready to send. '
              'Nothing is sent automatically — staff tap send in WhatsApp.',
              style: theme.textTheme.bodySmall?.copyWith(color: theme.colorScheme.onSurfaceVariant),
            ),
            SwitchListTile(
              value: _enabled,
              onChanged: _saving ? null : (value) => setState(() => _enabled = value),
              title: const Text('Offer a welcome message at check-in'),
              contentPadding: EdgeInsets.zero,
            ),
            TextField(
              controller: _codeController,
              enabled: !_saving,
              keyboardType: TextInputType.number,
              inputFormatters: [FilteringTextInputFormatter.digitsOnly, LengthLimitingTextInputFormatter(4)],
              decoration: const InputDecoration(
                labelText: 'Country code',
                prefixText: '+',
                helperText: 'Added to guest numbers saved without one.',
              ),
            ),
            const SizedBox(height: 12),
            TextField(
              controller: _templateController,
              enabled: !_saving,
              maxLines: 8,
              minLines: 4,
              maxLength: 1000,
              onChanged: (_) => setState(() {}),
              decoration: const InputDecoration(
                labelText: 'Welcome message',
                helperText: 'Placeholders: {guest} {room} {hotel} {hotel_phone} {checkin} {code}',
                helperMaxLines: 2,
                alignLabelWithHint: true,
              ),
            ),
            const SizedBox(height: 4),
            Text('Preview', style: theme.textTheme.labelMedium),
            const SizedBox(height: 4),
            Container(
              width: double.infinity,
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(
                color: theme.colorScheme.surfaceContainerHighest,
                borderRadius: BorderRadius.circular(12),
              ),
              child: Text(preview, style: theme.textTheme.bodyMedium),
            ),
            const SizedBox(height: 12),
            Row(
              children: [
                Expanded(
                  child: OutlinedButton(
                    onPressed: _saving
                        ? null
                        : () => setState(() => _templateController.text = defaultWelcomeTemplate),
                    child: const Text('Reset message'),
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: FilledButton(
                    onPressed: _saving ? null : _save,
                    child: const Text('Save'),
                  ),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}
