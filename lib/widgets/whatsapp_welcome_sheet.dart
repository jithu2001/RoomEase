import 'package:flutter/material.dart';

import '../models/models.dart';
import '../services/whatsapp_service.dart';
import 'feedback.dart';

/// Offers to open WhatsApp with a welcome message for [customer].
///
/// Silently does nothing when the hotel has the feature switched off or the
/// guest's phone number can't be messaged — sending a welcome is a bonus on
/// top of a check-in, never something that should interrupt it.
Future<void> offerWhatsAppWelcome(
  BuildContext context, {
  required WhatsAppService service,
  required Customer customer,
  required bool enabled,
}) async {
  if (!enabled) return;

  final message = await service.previewWelcome(customer);
  if (message == null || !context.mounted) return;
  final number = await service.targetNumber(customer);
  if (!context.mounted) return;

  final send = await showModalBottomSheet<bool>(
    context: context,
    isScrollControlled: true,
    showDragHandle: true,
    builder: (sheetContext) => _WelcomeSheet(
      guestName: customer.name,
      number: number ?? customer.phone,
      message: message,
    ),
  );
  if (send != true || !context.mounted) return;

  final result = await service.sendWelcome(customer);
  if (!context.mounted) return;
  switch (result) {
    case WhatsAppSendResult.opened:
      break;
    case WhatsAppSendResult.invalidNumber:
      context.showInfoToast("That phone number can't be messaged on WhatsApp.");
    case WhatsAppSendResult.unavailable:
      context.showInfoToast('Could not open WhatsApp — is it installed on this device?');
  }
}

class _WelcomeSheet extends StatelessWidget {
  final String guestName;
  final String number;
  final String message;
  const _WelcomeSheet({required this.guestName, required this.number, required this.message});

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return SafeArea(
      child: Padding(
        padding: EdgeInsets.fromLTRB(16, 0, 16, 16 + MediaQuery.viewInsetsOf(context).bottom),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text('Send a WhatsApp welcome?', style: theme.textTheme.titleMedium),
            const SizedBox(height: 4),
            Text(
              'To $guestName on $number',
              style: theme.textTheme.bodySmall?.copyWith(color: theme.colorScheme.onSurfaceVariant),
            ),
            const SizedBox(height: 12),
            ConstrainedBox(
              constraints: BoxConstraints(maxHeight: MediaQuery.sizeOf(context).height * 0.35),
              child: SingleChildScrollView(
                child: Container(
                  width: double.infinity,
                  padding: const EdgeInsets.all(12),
                  decoration: BoxDecoration(
                    color: theme.colorScheme.surfaceContainerHighest,
                    borderRadius: BorderRadius.circular(12),
                  ),
                  child: Text(message),
                ),
              ),
            ),
            const SizedBox(height: 8),
            Text(
              'WhatsApp opens with this message ready — tap send there.',
              style: theme.textTheme.bodySmall?.copyWith(color: theme.colorScheme.onSurfaceVariant),
            ),
            const SizedBox(height: 12),
            Row(
              children: [
                Expanded(
                  child: OutlinedButton(
                    onPressed: () => Navigator.of(context).pop(false),
                    child: const Text('Skip'),
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: FilledButton.icon(
                    onPressed: () => Navigator.of(context).pop(true),
                    icon: const Icon(Icons.chat_bubble_outline),
                    label: const Text('Open WhatsApp'),
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
