import 'package:flutter/material.dart';

import '../utils/app_date.dart';

/// A labeled date+time picker field — the Flutter equivalent of the
/// original's native `<input type="datetime-local">` (native date/time
/// wheels), used for check-in/check-out times.
class DateTimeField extends StatelessWidget {
  final String label;
  final DateTime? value;
  final String? errorText;
  final String? hintText;
  final bool enabled;
  final ValueChanged<DateTime?> onChanged;
  final DateTime? firstDate;
  final DateTime? lastDate;

  const DateTimeField({
    super.key,
    required this.label,
    required this.value,
    required this.onChanged,
    this.errorText,
    this.hintText,
    this.enabled = true,
    this.firstDate,
    this.lastDate,
  });

  Future<void> _pick(BuildContext context) async {
    final now = DateTime.now();
    final date = await showDatePicker(
      context: context,
      initialDate: value ?? now,
      firstDate: firstDate ?? DateTime(2000),
      lastDate: lastDate ?? now.add(const Duration(days: 3)),
    );
    if (date == null || !context.mounted) return;
    final time = await showTimePicker(
      context: context,
      initialTime: TimeOfDay.fromDateTime(value ?? now),
    );
    if (time == null) return;
    onChanged(DateTime(date.year, date.month, date.day, time.hour, time.minute));
  }

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: enabled ? () => _pick(context) : null,
      borderRadius: BorderRadius.circular(12),
      child: InputDecorator(
        decoration: InputDecoration(
          labelText: label,
          errorText: errorText,
          helperText: errorText == null ? hintText : null,
          suffixIcon: const Icon(Icons.calendar_today_outlined, size: 20),
        ),
        child: Text(value != null ? formatDateTime(toIso(value!)) : 'Select date & time'),
      ),
    );
  }
}
