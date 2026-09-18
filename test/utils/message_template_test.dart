import 'package:flutter_test/flutter_test.dart';
import 'package:roomease/utils/message_template.dart';

void main() {
  group('renderTemplate', () {
    test('substitutes every supported placeholder', () {
      final result = renderTemplate(
        '{guest} {room} {hotel} {hotel_phone} {checkin} {code}',
        {
          'guest': 'Anita',
          'room': '102',
          'hotel': 'Sea View',
          'hotel_phone': '9847000000',
          'checkin': '18 Sep 2026',
          'code': 'CUS-0042',
        },
      );
      expect(result, 'Anita 102 Sea View 9847000000 18 Sep 2026 CUS-0042');
    });

    test('leaves an unknown placeholder verbatim', () {
      expect(renderTemplate('Hi {guest}, {foo}', {'guest': 'Anita'}), 'Hi Anita, {foo}');
    });

    test('passes a template with no placeholders straight through', () {
      expect(renderTemplate('Welcome!', const {}), 'Welcome!');
    });

    test('the default template only uses supported placeholders', () {
      final unresolved = RegExp(r'\{([a-z_]+)\}')
          .allMatches(defaultWelcomeTemplate)
          .map((m) => m.group(1)!)
          .where((key) => !welcomePlaceholders.contains(key));
      expect(unresolved, isEmpty);
    });
  });
}
