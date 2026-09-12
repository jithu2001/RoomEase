import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../state/app_state.dart';
import '../../utils/validation.dart';
import '../../widgets/feedback.dart';

enum _PinMode { idle, set, remove }

/// "App Lock" section embedded in Settings — mirrors `pages/Settings/PinSettings.tsx`.
class PinSettings extends StatefulWidget {
  const PinSettings({super.key});

  @override
  State<PinSettings> createState() => _PinSettingsState();
}

class _PinSettingsState extends State<PinSettings> {
  _PinMode _mode = _PinMode.idle;
  final _pinController = TextEditingController();
  final _confirmController = TextEditingController();
  final _currentController = TextEditingController();
  String? _error;
  bool _busy = false;

  @override
  void dispose() {
    _pinController.dispose();
    _confirmController.dispose();
    _currentController.dispose();
    super.dispose();
  }

  void _reset() {
    _pinController.clear();
    _confirmController.clear();
    _currentController.clear();
    setState(() {
      _mode = _PinMode.idle;
      _error = null;
    });
  }

  Future<void> _save() async {
    final error = validatePin(_pinController.text);
    if (error != null) {
      setState(() => _error = error);
      return;
    }
    if (_pinController.text != _confirmController.text) {
      setState(() => _error = 'PINs do not match.');
      return;
    }
    setState(() {
      _busy = true;
      _error = null;
    });
    final appState = context.read<AppState>();
    final wasEnabled = appState.hotel.pinEnabled;
    try {
      await appState.services.settings.setPin(_pinController.text);
      await appState.reloadHotel();
      if (!mounted) return;
      context.showSuccessToast(wasEnabled ? 'App PIN changed' : 'App PIN enabled');
      _reset();
    } catch (e) {
      setState(() => _error = e.toString());
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _remove() async {
    setState(() {
      _busy = true;
      _error = null;
    });
    final appState = context.read<AppState>();
    try {
      await appState.services.settings.clearPin(_currentController.text);
      await appState.reloadHotel();
      if (!mounted) return;
      context.showSuccessToast('App PIN removed');
      _reset();
    } catch (_) {
      setState(() => _error = 'That PIN is incorrect.');
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final appState = context.watch<AppState>();
    final enabled = appState.hotel.pinEnabled;
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text('App Lock', style: Theme.of(context).textTheme.titleSmall),
            const SizedBox(height: 8),
            if (_mode == _PinMode.idle) ...[
              Text(
                enabled
                    ? 'A PIN is required to open this app.'
                    : 'Add a PIN to keep this app locked when not in use.',
                style: TextStyle(color: Theme.of(context).colorScheme.onSurfaceVariant),
              ),
              const SizedBox(height: 12),
              Wrap(spacing: 8, runSpacing: 8, children: [
                OutlinedButton(onPressed: () => setState(() => _mode = _PinMode.set), child: Text(enabled ? 'Change PIN' : 'Enable PIN')),
                if (enabled) OutlinedButton(onPressed: () => setState(() => _mode = _PinMode.remove), child: const Text('Remove PIN')),
              ]),
            ] else if (_mode == _PinMode.set) ...[
              TextField(
                controller: _pinController,
                obscureText: true,
                keyboardType: TextInputType.number,
                maxLength: 8,
                decoration: InputDecoration(labelText: 'New PIN (4-8 digits)', errorText: _error, counterText: ''),
              ),
              TextField(
                controller: _confirmController,
                obscureText: true,
                keyboardType: TextInputType.number,
                maxLength: 8,
                decoration: const InputDecoration(labelText: 'Confirm PIN', counterText: ''),
              ),
              const SizedBox(height: 12),
              Row(children: [
                Expanded(child: OutlinedButton(onPressed: _busy ? null : _reset, child: const Text('Cancel'))),
                const SizedBox(width: 12),
                Expanded(child: FilledButton(onPressed: _busy ? null : _save, child: const Text('Save'))),
              ]),
            ] else ...[
              TextField(
                controller: _currentController,
                obscureText: true,
                keyboardType: TextInputType.number,
                decoration: InputDecoration(labelText: 'Enter the current PIN', errorText: _error),
              ),
              const SizedBox(height: 12),
              Row(children: [
                Expanded(child: OutlinedButton(onPressed: _busy ? null : _reset, child: const Text('Cancel'))),
                const SizedBox(width: 12),
                Expanded(
                  child: FilledButton(
                    onPressed: _busy ? null : _remove,
                    style: FilledButton.styleFrom(
                      backgroundColor: Theme.of(context).colorScheme.error,
                      foregroundColor: Theme.of(context).colorScheme.onError,
                    ),
                    child: const Text('Remove PIN'),
                  ),
                ),
              ]),
            ],
          ],
        ),
      ),
    );
  }
}
