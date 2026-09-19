import 'package:flutter_test/flutter_test.dart';
import 'package:roomease/utils/app_date.dart';

void main() {
  test('toIso round-trips through parseStoredIso', () {
    final dt = DateTime(2026, 8, 18, 10, 35, 0);
    final iso = toIso(dt);
    expect(iso, matches(RegExp(r'^2026-08-18T10:35:00\.000[+-]\d{2}:\d{2}$')));
    final parsed = parseStoredIso(iso)!;
    expect(parsed.year, 2026);
    expect(parsed.month, 8);
    expect(parsed.day, 18);
    expect(parsed.hour, 10);
    expect(parsed.minute, 35);
  });

  test('dayKeyOf is a cheap string slice, not a timezone reinterpretation', () {
    expect(dayKeyOf('2026-08-18T23:59:00.000+05:30'), '2026-08-18');
  });

  test('parseStoredIso is null for empty/malformed input', () {
    expect(parseStoredIso(null), isNull);
    expect(parseStoredIso(''), isNull);
  });

  test('formatDateTime renders a friendly string', () {
    final iso = toIso(DateTime(2026, 8, 18, 10, 35));
    expect(formatDateTime(iso), '18 Aug 2026, 10:35 AM');
  });

  test('formatDateTime falls back to an em dash', () {
    expect(formatDateTime(null), '—');
  });

  test('nightsBetween clamps to zero and floors whole nights', () {
    final from = toIso(DateTime(2026, 8, 18, 10, 0));
    final sameDay = toIso(DateTime(2026, 8, 18, 20, 0));
    final nextDay = toIso(DateTime(2026, 8, 19, 9, 0));
    expect(nightsBetween(from, sameDay), 0);
    expect(nightsBetween(from, nextDay), 0); // 23h < 24h
    final twoDaysLater = toIso(DateTime(2026, 8, 20, 11, 0));
    expect(nightsBetween(from, twoDaysLater), 2);
  });

  test('isFutureBeyond respects the hour threshold', () {
    final now = DateTime(2026, 1, 1, 12);
    final iso = toIso(now.add(const Duration(hours: 30)));
    expect(isFutureBeyond(iso, 24, now), isTrue);
    final iso2 = toIso(now.add(const Duration(hours: 10)));
    expect(isFutureBeyond(iso2, 24, now), isFalse);
  });

  test('backupStamp formats as YYYY-MM-DD-HHmm', () {
    expect(backupStamp(DateTime(2026, 8, 18, 9, 5)), '2026-08-18-0905');
  });
}
