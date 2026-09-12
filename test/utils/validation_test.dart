import 'package:flutter_test/flutter_test.dart';
import 'package:roomease/utils/validation.dart';

void main() {
  group('validateName', () {
    test('rejects blank/too short/too long', () {
      expect(validateName(''), isNotNull);
      expect(validateName('A'), isNotNull);
      expect(validateName('A' * 81), isNotNull);
    });
    test('accepts a normal name', () {
      expect(validateName('Ravi Kumar'), isNull);
    });
  });

  group('validatePhone', () {
    test('rejects letters', () {
      expect(validatePhone('98470abc12'), isNotNull);
    });
    test('rejects too few/too many digits', () {
      expect(validatePhone('12345'), isNotNull);
      expect(validatePhone('1' * 16), isNotNull);
    });
    test('accepts a formatted number', () {
      expect(validatePhone('+91 98470-12345'), isNull);
    });
  });

  group('validatePersons', () {
    test('rejects non-integers and out-of-range values', () {
      expect(validatePersons('2.5'), isNotNull);
      expect(validatePersons('0'), isNotNull);
      expect(validatePersons('21'), isNotNull);
      expect(validatePersons('abc'), isNotNull);
    });
    test('accepts 1-20', () {
      expect(validatePersons('1'), isNull);
      expect(validatePersons('20'), isNull);
    });
  });

  group('validateNewRoomNumber', () {
    test('rejects duplicates case-insensitively', () {
      expect(validateNewRoomNumber('101', ['101']), isNotNull);
      expect(validateNewRoomNumber('a1', ['A1']), isNotNull);
    });
    test('rejects unsafe characters and overlong labels', () {
      expect(validateNewRoomNumber('101; DROP TABLE', []), isNotNull);
      expect(validateNewRoomNumber('12345678901', []), isNotNull);
    });
    test('accepts a fresh, valid room number', () {
      expect(validateNewRoomNumber('101-A', ['102']), isNull);
    });
  });

  group('check-in / check-out time validation', () {
    test('check-in cannot be far in the future', () {
      final now = DateTime(2026, 1, 1, 12);
      final farFuture = now.add(const Duration(hours: 48));
      expect(validateCheckInTime(farFuture, now: now), isNotNull);
      expect(validateCheckInTime(now, now: now), isNull);
    });
    test('check-out blank means still staying, which is valid', () {
      expect(validateCheckOutTime(null, DateTime(2026, 1, 1)), isNull);
    });
    test('check-out before check-in is rejected', () {
      final checkIn = DateTime(2026, 1, 2);
      final checkOut = DateTime(2026, 1, 1);
      expect(validateCheckOutTime(checkOut, checkIn), isNotNull);
    });
  });

  group('validatePin', () {
    test('accepts 4-8 digits only', () {
      expect(validatePin('1234'), isNull);
      expect(validatePin('12345678'), isNull);
      expect(validatePin('123'), isNotNull);
      expect(validatePin('123456789'), isNotNull);
      expect(validatePin('12ab'), isNotNull);
    });
  });

  group('normaliseCustomerInput', () {
    test('trims and collapses whitespace in the name', () {
      final values = CustomerFormValues(
        name: '  Ravi   Kumar  ',
        address: ' 123 Main St ',
        phone: ' 9847012345 ',
        roomNumber: ' 101 ',
        numberOfPersonsText: '2',
        amountText: '1500.50',
        checkInAt: DateTime(2026, 1, 1, 10),
        checkOutAt: null,
      );
      final normalised = normaliseCustomerInput(values);
      expect(normalised.name, 'Ravi Kumar');
      expect(normalised.address, '123 Main St');
      expect(normalised.roomNumber, '101');
      expect(normalised.numberOfPersons, 2);
      expect(normalised.amountMinor, 150050);
    });
  });
}
