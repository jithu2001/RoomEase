import 'package:flutter/material.dart';

import '../theme/app_theme.dart';
import '../utils/app_error.dart';

/// Shared loading / empty / error / toast / confirm primitives, used
/// consistently across every screen — mirrors `components/Feedback.tsx`,
/// `ToastProvider.tsx` and `ConfirmProvider.tsx`, built on Flutter/Material 3
/// primitives instead of bespoke React components.

class FullScreenLoading extends StatelessWidget {
  final String label;
  const FullScreenLoading({super.key, this.label = 'Loading…'});

  @override
  Widget build(BuildContext context) => Scaffold(
        body: Center(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              const CircularProgressIndicator(),
              const SizedBox(height: 16),
              Text(label, style: Theme.of(context).textTheme.bodyMedium),
            ],
          ),
        ),
      );
}

class InlineLoading extends StatelessWidget {
  final String label;
  const InlineLoading({super.key, this.label = 'Loading…'});

  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.symmetric(vertical: 32),
        child: Center(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              const SizedBox(width: 24, height: 24, child: CircularProgressIndicator(strokeWidth: 2.5)),
              const SizedBox(height: 12),
              Text(label, style: Theme.of(context).textTheme.bodyMedium),
            ],
          ),
        ),
      );
}

enum NoticeKind { info, warn, error }

class Notice extends StatelessWidget {
  final String message;
  final NoticeKind kind;
  final Widget? action;
  const Notice({super.key, required this.message, this.kind = NoticeKind.info, this.action});

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final status = context.statusColors;
    final (bg, fg, icon) = switch (kind) {
      NoticeKind.info => (scheme.secondaryContainer, scheme.onSecondaryContainer, Icons.info_outline),
      NoticeKind.warn => (status.warningContainer, status.onWarningContainer, Icons.warning_amber_rounded),
      NoticeKind.error => (scheme.errorContainer, scheme.onErrorContainer, Icons.error_outline),
    };
    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(color: bg, borderRadius: BorderRadius.circular(12)),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(icon, color: fg, size: 20),
          const SizedBox(width: 10),
          Expanded(child: Text(message, style: TextStyle(color: fg))),
          if (action != null) ...[const SizedBox(width: 8), action!],
        ],
      ),
    );
  }
}

class EmptyState extends StatelessWidget {
  final String glyph;
  final String title;
  final String? message;
  final Widget? action;
  const EmptyState({super.key, required this.glyph, required this.title, this.message, this.action});

  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.symmetric(vertical: 48, horizontal: 24),
        child: Center(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Text(glyph, style: const TextStyle(fontSize: 40)),
              const SizedBox(height: 12),
              Text(title, style: Theme.of(context).textTheme.titleMedium, textAlign: TextAlign.center),
              if (message != null) ...[
                const SizedBox(height: 4),
                Text(
                  message!,
                  style: Theme.of(context).textTheme.bodyMedium?.copyWith(color: Theme.of(context).colorScheme.onSurfaceVariant),
                  textAlign: TextAlign.center,
                ),
              ],
              if (action != null) ...[const SizedBox(height: 16), action!],
            ],
          ),
        ),
      );
}

class ErrorState extends StatelessWidget {
  final String message;
  final VoidCallback onRetry;
  const ErrorState({super.key, required this.message, required this.onRetry});

  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.symmetric(vertical: 48, horizontal: 24),
        child: Center(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Icon(Icons.error_outline, size: 40, color: Theme.of(context).colorScheme.error),
              const SizedBox(height: 12),
              Text(message, textAlign: TextAlign.center, style: Theme.of(context).textTheme.bodyMedium),
              const SizedBox(height: 16),
              OutlinedButton(onPressed: onRetry, child: const Text('Try again')),
            ],
          ),
        ),
      );
}

/// Toast/snackbar helpers.
extension AppFeedback on BuildContext {
  void showSuccessToast(String message) => _showToast(message, isError: false);

  void showErrorToast(Object error) => _showToast(toUserMessage(error), isError: true);

  void showInfoToast(String message) => _showToast(message, isError: false);

  void _showToast(String message, {required bool isError}) {
    final messenger = ScaffoldMessenger.of(this);
    messenger.hideCurrentSnackBar();
    final scheme = Theme.of(this).colorScheme;
    messenger.showSnackBar(SnackBar(
      content: Text(message),
      backgroundColor: isError ? scheme.errorContainer : null,
      duration: Duration(milliseconds: isError ? 5000 : 2800),
    ));
  }
}

/// A promise-based confirm dialog — mirrors `useConfirm()`.
Future<bool> showConfirmDialog(
  BuildContext context, {
  required String title,
  required String message,
  String confirmLabel = 'Confirm',
  String cancelLabel = 'Cancel',
  bool danger = false,
  String? requirePhrase,
}) async {
  final result = await showDialog<bool>(
    context: context,
    builder: (context) => _ConfirmDialog(
      title: title,
      message: message,
      confirmLabel: confirmLabel,
      cancelLabel: cancelLabel,
      danger: danger,
      requirePhrase: requirePhrase,
    ),
  );
  return result ?? false;
}

class _ConfirmDialog extends StatefulWidget {
  final String title;
  final String message;
  final String confirmLabel;
  final String cancelLabel;
  final bool danger;
  final String? requirePhrase;
  const _ConfirmDialog({
    required this.title,
    required this.message,
    required this.confirmLabel,
    required this.cancelLabel,
    required this.danger,
    required this.requirePhrase,
  });

  @override
  State<_ConfirmDialog> createState() => _ConfirmDialogState();
}

class _ConfirmDialogState extends State<_ConfirmDialog> {
  final _phraseController = TextEditingController();

  @override
  void dispose() {
    _phraseController.dispose();
    super.dispose();
  }

  bool get _phraseOk => widget.requirePhrase == null || _phraseController.text == widget.requirePhrase;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return AlertDialog(
      title: Text(widget.title),
      content: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(widget.message),
          if (widget.requirePhrase != null) ...[
            const SizedBox(height: 16),
            Text('Type "${widget.requirePhrase}" to confirm:', style: Theme.of(context).textTheme.bodySmall),
            const SizedBox(height: 8),
            TextField(
              controller: _phraseController,
              autofocus: true,
              onChanged: (_) => setState(() {}),
              decoration: const InputDecoration(isDense: true),
            ),
          ],
        ],
      ),
      actions: [
        TextButton(onPressed: () => Navigator.of(context).pop(false), child: Text(widget.cancelLabel)),
        FilledButton(
          onPressed: _phraseOk ? () => Navigator.of(context).pop(true) : null,
          style: widget.danger ? FilledButton.styleFrom(backgroundColor: scheme.error, foregroundColor: scheme.onError) : null,
          child: Text(widget.confirmLabel),
        ),
      ],
    );
  }
}
