import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../state/app_state.dart';

/// Full-screen PIN entry shown before any route renders when a PIN is
/// configured — mirrors `components/PinLock.tsx`.
class PinLockPage extends StatefulWidget {
  const PinLockPage({super.key});

  @override
  State<PinLockPage> createState() => _PinLockPageState();
}

class _PinLockPageState extends State<PinLockPage> {
  String _pin = '';
  String? _error;
  bool _checking = false;

  void _press(String digit) {
    if (_pin.length >= 8) return;
    setState(() {
      _pin += digit;
      _error = null;
    });
  }

  void _backspace() {
    if (_pin.isEmpty) return;
    setState(() => _pin = _pin.substring(0, _pin.length - 1));
  }

  Future<void> _unlock() async {
    if (_pin.length < 4 || _checking) return;
    setState(() => _checking = true);
    final appState = context.read<AppState>();
    try {
      final ok = await appState.services.settings.verifyPin(_pin);
      if (!mounted) return;
      if (ok) {
        appState.unlock();
      } else {
        setState(() {
          _error = 'Incorrect PIN. Try again.';
          _pin = '';
        });
      }
    } catch (e) {
      if (mounted) {
        setState(() {
          _error = 'Could not verify PIN. Try again.';
          _pin = '';
        });
      }
    } finally {
      if (mounted) setState(() => _checking = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final appState = context.watch<AppState>();
    final scheme = Theme.of(context).colorScheme;
    final dotCount = _pin.length > 4 ? _pin.length : 4;

    return Scaffold(
      body: SafeArea(
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 24),
          child: Column(
            children: [
              const Spacer(),
              Icon(Icons.lock_outline, size: 40, color: scheme.primary),
              const SizedBox(height: 12),
              Text(
                appState.hotel.hotelName.isNotEmpty ? appState.hotel.hotelName : 'Hotel Manager',
                style: Theme.of(context).textTheme.headlineSmall,
                textAlign: TextAlign.center,
              ),
              const SizedBox(height: 4),
              Text('Enter your app PIN', style: TextStyle(color: scheme.onSurfaceVariant)),
              const SizedBox(height: 24),
              Row(
                mainAxisAlignment: MainAxisAlignment.center,
                children: List.generate(dotCount, (i) {
                  final filled = i < _pin.length;
                  return Container(
                    margin: const EdgeInsets.symmetric(horizontal: 6),
                    width: 14,
                    height: 14,
                    decoration: BoxDecoration(
                      shape: BoxShape.circle,
                      color: filled ? scheme.primary : Colors.transparent,
                      border: Border.all(color: scheme.primary, width: 1.5),
                    ),
                  );
                }),
              ),
              const SizedBox(height: 16),
              SizedBox(
                height: 24,
                child: _error != null
                    ? Text(_error!, style: TextStyle(color: scheme.error), semanticsLabel: _error)
                    : null,
              ),
              const SizedBox(height: 16),
              _Keypad(onDigit: _press, onBackspace: _backspace),
              const SizedBox(height: 16),
              SizedBox(
                width: double.infinity,
                child: FilledButton(
                  onPressed: _pin.length >= 4 && !_checking ? _unlock : null,
                  child: _checking
                      ? const SizedBox(width: 20, height: 20, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
                      : const Text('Unlock'),
                ),
              ),
              const Spacer(),
            ],
          ),
        ),
      ),
    );
  }
}

class _Keypad extends StatelessWidget {
  final ValueChanged<String> onDigit;
  final VoidCallback onBackspace;
  const _Keypad({required this.onDigit, required this.onBackspace});

  @override
  Widget build(BuildContext context) {
    const rows = [
      ['1', '2', '3'],
      ['4', '5', '6'],
      ['7', '8', '9'],
      ['', '0', '⌫'],
    ];
    return Column(
      mainAxisSize: MainAxisSize.min,
      children: rows
          .map((row) => Row(
                mainAxisAlignment: MainAxisAlignment.spaceEvenly,
                children: row.map((key) {
                  if (key.isEmpty) return const SizedBox(width: 72, height: 56);
                  return _KeypadButton(
                    label: key,
                    onTap: key == '⌫' ? onBackspace : () => onDigit(key),
                  );
                }).toList(),
              ))
          .toList(),
    );
  }
}

class _KeypadButton extends StatelessWidget {
  final String label;
  final VoidCallback onTap;
  const _KeypadButton({required this.label, required this.onTap});

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      width: 72,
      height: 56,
      child: Material(
        color: Colors.transparent,
        shape: const StadiumBorder(),
        child: InkWell(
          onTap: onTap,
          customBorder: const StadiumBorder(),
          child: Center(
            child: Text(label, style: Theme.of(context).textTheme.headlineSmall),
          ),
        ),
      ),
    );
  }
}
