/// Customer code scheme: `CUS-000001` — mirrors `src/utils/customerCode.ts`.
///
/// Format is `CUS-` + a zero-padded 6-digit sequence, but the pattern allows
/// *more* digits once the counter passes 999999 — codes never truncate or
/// wrap. The next code is always one past the highest existing code (see
/// `CustomerRepository.highestCustomerCode`), not a separate counter table.
library;

const _codePrefix = 'CUS-';
const _codeDigits = 6;
final _codePattern = RegExp(r'^CUS-\d{6,}$');

/// Formats a positive sequence number as a customer code.
String formatCustomerCode(int sequence) {
  if (sequence <= 0) {
    throw ArgumentError('Customer code sequence must be a positive integer, got $sequence');
  }
  return '$_codePrefix${sequence.toString().padLeft(_codeDigits, '0')}';
}

/// Parses the numeric suffix out of a customer code, or null if [code]
/// doesn't match the expected shape.
int? parseCustomerCode(String code) {
  if (!_codePattern.hasMatch(code)) return null;
  final digits = code.substring(_codePrefix.length);
  final value = int.tryParse(digits);
  if (value == null || value <= 0) return null;
  return value;
}

/// The next code to allocate, one past [highestExisting] (or the first code
/// if there isn't one yet).
String nextCustomerCode(String? highestExisting) {
  final current = highestExisting != null ? parseCustomerCode(highestExisting) ?? 0 : 0;
  return formatCustomerCode(current + 1);
}

/// True if [code] is safe to use as a directory name — used as a security
/// gate before deriving a filesystem path from a (possibly attacker- or
/// corruption-controlled, e.g. from a backup restore) customer code.
bool isSafeCustomerCode(String code) => _codePattern.hasMatch(code);
