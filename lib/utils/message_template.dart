/// Placeholder substitution for the hotel-editable WhatsApp welcome message.
library;

/// Placeholders the welcome template understands, in the order the Settings
/// help text lists them.
const welcomePlaceholders = <String>[
  'guest',
  'room',
  'hotel',
  'hotel_phone',
  'checkin',
  'code',
];

final _tokenPattern = RegExp(r'\{([a-z_]+)\}');

/// Replaces `{key}` tokens in [template] with the matching entry from [values].
///
/// An unknown token is left verbatim rather than blanked, so a typo in the
/// hotel's own template shows up in the preview instead of quietly vanishing
/// from the guest's message.
String renderTemplate(String template, Map<String, String> values) {
  return template.replaceAllMapped(_tokenPattern, (match) {
    final key = match.group(1)!;
    return values[key] ?? match.group(0)!;
  });
}

/// The message a fresh install sends. Kept here so both the settings default
/// and the "Reset to default" button read from one place.
const defaultWelcomeTemplate = 'Dear {guest},\n'
    '\n'
    'Welcome to {hotel}! 🏨 We are delighted to have you with us.\n'
    '\n'
    'Your check-in is confirmed for {checkin}. Our team is here to make your stay a comfortable one, '
    'so please do not hesitate to ask if there is anything at all you need.\n'
    '\n'
    'You can reach us any time on {hotel_phone}.\n'
    '\n'
    'Wishing you a wonderful stay! 🌸';
