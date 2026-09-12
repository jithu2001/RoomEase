import 'package:flutter_test/flutter_test.dart';
import 'package:roomease/utils/money.dart';

void main() {
  group('parseAmountToMinor', () {
    test('blank is valid-empty', () {
      final r = parseAmountToMinor('');
      expect(r.valid, isTrue);
      expect(r.minor, isNull);
    });

    test('whole rupees', () {
      expect(parseAmountToMinor('1500').minor, 150000);
    });

    test('two decimal places', () {
      expect(parseAmountToMinor('1500.50').minor, 150050);
    });

    test('strips currency symbol, commas and whitespace', () {
      expect(parseAmountToMinor('₹ 1,500.50').minor, 150050);
    });

    test('rejects more than two decimal places', () {
      expect(parseAmountToMinor('10.999').valid, isFalse);
    });

    test('rejects negative/garbage input', () {
      expect(parseAmountToMinor('-100').valid, isFalse);
      expect(parseAmountToMinor('abc').valid, isFalse);
    });

    test('rejects amounts over the ceiling', () {
      expect(parseAmountToMinor('99999999999').valid, isFalse);
    });

    test('no float precision loss for repeating-decimal-prone values', () {
      expect(parseAmountToMinor('0.10').minor, 10);
      expect(parseAmountToMinor('0.20').minor, 20);
      expect(parseAmountToMinor('0.30').minor, 30);
    });
  });

  group('formatMinor', () {
    test('formats with thousands separators', () {
      expect(formatMinor(150000), '₹1,500.00');
      expect(formatMinor(123456789), '₹1,234,567.89');
    });

    test('null is an em dash', () {
      expect(formatMinor(null), '—');
    });

    test('zero is a real amount, not "unset"', () {
      expect(formatMinor(0), '₹0.00');
    });
  });

  group('minorToInput', () {
    test('plain decimal, no symbol or grouping', () {
      expect(minorToInput(150050), '1500.50');
      expect(minorToInput(null), '');
    });
  });

  group('validateAmount', () {
    test('blank is valid', () {
      expect(validateAmount(''), isNull);
    });
    test('invalid text produces a message', () {
      expect(validateAmount('not a number'), isNotNull);
    });
  });
}
