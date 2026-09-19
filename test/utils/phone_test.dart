import 'package:flutter_test/flutter_test.dart';
import 'package:roomease/utils/phone.dart';

void main() {
  group('whatsappNumber', () {
    test('prepends the default country code to a bare local number', () {
      expect(whatsappNumber('9847012345'), '919847012345');
    });

    test('strips separators from an already-international number', () {
      expect(whatsappNumber('+91 98470-12345'), '919847012345');
      expect(whatsappNumber('+1 (555) 010-9999'), '15550109999');
    });

    test('drops a national trunk prefix before adding the country code', () {
      expect(whatsappNumber('098470 12345'), '919847012345');
    });

    test('treats a leading 00 as the international access prefix', () {
      expect(whatsappNumber('0091 98470 12345'), '919847012345');
    });

    test('respects a non-default country code', () {
      expect(whatsappNumber('5550109999', defaultCountryCode: '1'), '15550109999');
      expect(whatsappNumber('+91 9847012345', defaultCountryCode: '1'), '919847012345');
    });

    test('rejects numbers that are too short or too long', () {
      expect(whatsappNumber('12345'), isNull);
      expect(whatsappNumber('+1234567890123456'), isNull);
    });

    test('rejects blank and non-numeric input', () {
      expect(whatsappNumber(''), isNull);
      expect(whatsappNumber('   '), isNull);
      expect(whatsappNumber('not a phone'), isNull);
    });
  });
}
