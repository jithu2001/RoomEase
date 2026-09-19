/// Minor-unit (paise) currency helpers — mirrors `src/utils/money.ts`.
///
/// All amounts are stored as integer minor units, never floats, to avoid
/// float rounding issues (the classic 0.1 + 0.2 problem) in a record of what
/// a guest paid.
library;

const currencySymbol = '₹';
const _minorUnitsPerMajor = 100;
/// Generous ceiling (₹1,000,000.00) that still catches a slipped decimal or typo.
const maxAmountMinor = 100000000;

/// Three-state parse result for an amount text field.
///
/// - [valid] true & [minor] null: field left blank — a legitimate "not
///   recorded" amount.
/// - [valid] true & [minor] non-null: a parsed amount.
/// - [valid] false: the text could not be parsed as a valid amount.
class ParsedAmount {
  final int? minor;
  final bool valid;
  const ParsedAmount.value(this.minor) : valid = true;
  const ParsedAmount.invalid()
      : minor = null,
        valid = false;
}

final _amountPattern = RegExp(r'^\d+(\.\d{1,2})?$');

/// Parses free-form text (currency symbol/commas/whitespace tolerated) into
/// minor units.
ParsedAmount parseAmountToMinor(String input) {
  var cleaned = input.trim();
  if (cleaned.isEmpty) return const ParsedAmount.value(null);
  cleaned = cleaned.replaceAll(currencySymbol, '').replaceAll(',', '').replaceAll(RegExp(r'\s+'), '');
  if (cleaned.isEmpty) return const ParsedAmount.value(null);
  if (!_amountPattern.hasMatch(cleaned)) return const ParsedAmount.invalid();
  final parts = cleaned.split('.');
  final whole = parts[0];
  final fraction = parts.length > 1 ? parts[1].padRight(2, '0') : '00';
  final wholeValue = int.tryParse(whole);
  final fractionValue = int.tryParse(fraction);
  if (wholeValue == null || fractionValue == null) return const ParsedAmount.invalid();
  final minor = wholeValue * _minorUnitsPerMajor + fractionValue;
  if (minor > maxAmountMinor) return const ParsedAmount.invalid();
  return ParsedAmount.value(minor);
}

/// Manual thousands-comma grouping — deliberately not using `intl`'s
/// `NumberFormat`, whose ICU data can differ across Android versions and
/// would make formatting non-deterministic across devices.
String _groupThousands(String digits) {
  final buffer = StringBuffer();
  final offset = digits.length % 3;
  for (var i = 0; i < digits.length; i++) {
    if (i != 0 && (i - offset) % 3 == 0) buffer.write(',');
    buffer.write(digits[i]);
  }
  return buffer.toString();
}

/// `'₹1,500.00'`, or `'—'` if [minor] is null.
String formatMinor(int? minor) {
  if (minor == null) return '—';
  final negative = minor < 0;
  final abs = minor.abs();
  final whole = abs ~/ _minorUnitsPerMajor;
  final fraction = (abs % _minorUnitsPerMajor).toString().padLeft(2, '0');
  final grouped = _groupThousands(whole.toString());
  return '${negative ? '-' : ''}$currencySymbol$grouped.$fraction';
}

/// Plain `'1500.00'` (no symbol/grouping) for an editable text field.
String minorToInput(int? minor) {
  if (minor == null) return '';
  final whole = minor ~/ _minorUnitsPerMajor;
  final fraction = (minor % _minorUnitsPerMajor).toString().padLeft(2, '0');
  return '$whole.$fraction';
}

/// Field-level validation message, or null if [input] is valid (including blank).
String? validateAmount(String input) {
  final parsed = parseAmountToMinor(input);
  if (!parsed.valid) {
    return 'Enter a valid amount (up to 2 decimal places).';
  }
  if (parsed.minor != null && parsed.minor! > maxAmountMinor) {
    return 'Amount must be at most ${formatMinor(maxAmountMinor)}.';
  }
  return null;
}
