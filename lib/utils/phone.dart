/// Phone-number helpers for outbound links (WhatsApp, `tel:`).
///
/// These are **display/link helpers only**. Stored `customers.phone` values are
/// deliberately left exactly as staff typed them: that column is the join key
/// for the returning-guest lookup and the `stay_count` subquery in
/// `CustomerRepository`, so rewriting it would silently break stay history.
library;

import 'validation.dart';

/// Digits-only phone numbers can't be shorter than this and still be dialable.
const _minDigits = Limits.phoneMin;

/// E.164 caps the whole number, country code included, at 15 digits.
const _maxDigits = 15;

/// Converts a stored phone number into the digits-only form `wa.me` expects
/// (country code first, no `+`, no separators), or null if [raw] can't be
/// turned into a plausible number.
///
/// [defaultCountryCode] is prepended only when [raw] carries no international
/// prefix of its own:
///
/// ```dart
/// whatsappNumber('9847012345')      // '919847012345'
/// whatsappNumber('+91 98470-12345') // '919847012345'
/// whatsappNumber('098470 12345')    // '919847012345' — 0 is a trunk prefix
/// whatsappNumber('0091 9847012345') // '919847012345' — 00 is international
/// whatsappNumber('12345')           // null — too short
/// ```
String? whatsappNumber(String raw, {String defaultCountryCode = '91'}) {
  final trimmed = raw.trim();
  if (trimmed.isEmpty) return null;

  final international = trimmed.startsWith('+');
  var digits = trimmed.replaceAll(RegExp(r'\D'), '');
  if (digits.isEmpty) return null;

  if (international) {
    // Already carries its country code.
  } else if (digits.startsWith('00')) {
    // '00' is the international access prefix — what follows is a full number.
    digits = digits.substring(2);
  } else {
    // A bare local number. A leading '0' is a national trunk prefix and is
    // dropped before the country code goes on. The length check happens
    // *here*, on the subscriber digits alone: otherwise a stub like '12345'
    // would be padded past the minimum by the country code and sail through.
    final national = digits.replaceFirst(RegExp(r'^0+'), '');
    if (national.length < _minDigits) return null;
    digits = '${defaultCountryCode.replaceAll(RegExp(r'\D'), '')}$national';
  }

  if (digits.length < _minDigits || digits.length > _maxDigits) return null;
  return digits;
}
