import 'package:flutter_test/flutter_test.dart';
import 'package:roomease/utils/customer_code.dart';

void main() {
  test('formats a sequence as a zero-padded code', () {
    expect(formatCustomerCode(1), 'CUS-000001');
    expect(formatCustomerCode(42), 'CUS-000042');
  });

  test('rejects non-positive sequences', () {
    expect(() => formatCustomerCode(0), throwsArgumentError);
    expect(() => formatCustomerCode(-1), throwsArgumentError);
  });

  test('parses the numeric suffix back out', () {
    expect(parseCustomerCode('CUS-000042'), 42);
    expect(parseCustomerCode('not-a-code'), isNull);
    expect(parseCustomerCode('CUS-0'), isNull); // fewer than 6 digits
  });

  test('grows past 6 digits without truncating', () {
    expect(parseCustomerCode('CUS-1234567'), 1234567);
    expect(nextCustomerCode('CUS-999999'), 'CUS-1000000');
  });

  test('next code is one past the highest existing, or the first code', () {
    expect(nextCustomerCode(null), 'CUS-000001');
    expect(nextCustomerCode('CUS-000042'), 'CUS-000043');
  });

  test('isSafeCustomerCode gates directory-name usage', () {
    expect(isSafeCustomerCode('CUS-000001'), isTrue);
    expect(isSafeCustomerCode('../../etc/passwd'), isFalse);
    expect(isSafeCustomerCode('CUS-abc'), isFalse);
  });
}
