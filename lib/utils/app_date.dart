/// Local-offset ISO 8601 timestamp helpers.
///
/// Every timestamp this app stores carries the *device's local wall-clock
/// time plus its local UTC offset*, e.g. `2026-08-18T10:35:00.000+05:30` —
/// never a bare UTC timestamp. This mirrors the original `src/utils/date.ts`
/// exactly: it makes `substr(ts, 1, 10)` a cheap, always-correct local
/// calendar day for SQL filtering (see the repositories), and it never
/// drifts across the UTC midnight boundary the way a UTC-normalised
/// timestamp would for a guest checking in at, say, 11pm IST.
library;

const _months = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

String _pad2(int n) => n.toString().padLeft(2, '0');
String _pad3(int n) => n.toString().padLeft(3, '0');
String _pad4(int n) => n.toString().padLeft(4, '0');

/// Formats [dt] (must be a local, non-UTC `DateTime`) as
/// `YYYY-MM-DDTHH:mm:ss.SSS±HH:MM`.
String toIso(DateTime dt) {
  assert(!dt.isUtc, 'toIso expects a local DateTime, got a UTC one');
  final offset = dt.timeZoneOffset;
  final totalMinutes = offset.inMinutes;
  final sign = totalMinutes < 0 ? '-' : '+';
  final absMinutes = totalMinutes.abs();
  final offH = _pad2(absMinutes ~/ 60);
  final offM = _pad2(absMinutes % 60);
  return '${_pad4(dt.year)}-${_pad2(dt.month)}-${_pad2(dt.day)}'
      'T${_pad2(dt.hour)}:${_pad2(dt.minute)}:${_pad2(dt.second)}.${_pad3(dt.millisecond)}'
      '$sign$offH:$offM';
}

/// Now, as a local-offset ISO string.
String nowIso() => toIso(DateTime.now());

/// `YYYY-MM-DD` for [dt] (local calendar day).
String toDayKey(DateTime dt) => '${_pad4(dt.year)}-${_pad2(dt.month)}-${_pad2(dt.day)}';

/// `YYYY-MM` for [dt] (local calendar month) — matches the first 7
/// characters of a stored ISO string, for cheap "this month" filtering.
String toMonthKey(DateTime dt) => '${_pad4(dt.year)}-${_pad2(dt.month)}';

/// The local calendar day encoded at the front of a stored ISO string —
/// a cheap string slice, not a timezone reinterpretation. Relies on every
/// stored timestamp using the local-offset convention above.
String dayKeyOf(String iso) => iso.length >= 10 ? iso.substring(0, 10) : iso;

final _isoWithOffset = RegExp(
  r'^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,3}))?([+-]\d{2}):?(\d{2})$',
);

/// Parses a stored local-offset ISO string back into the equivalent local
/// `DateTime` for the *current* device timezone (matching the original
/// app's behaviour of formatting through the platform's local-time getters).
/// Returns null if [iso] is empty or malformed.
DateTime? parseStoredIso(String? iso) {
  if (iso == null || iso.isEmpty) return null;
  final m = _isoWithOffset.firstMatch(iso);
  if (m == null) {
    try {
      return DateTime.parse(iso).toLocal();
    } catch (_) {
      return null;
    }
  }
  final year = int.parse(m.group(1)!);
  final month = int.parse(m.group(2)!);
  final day = int.parse(m.group(3)!);
  final hour = int.parse(m.group(4)!);
  final minute = int.parse(m.group(5)!);
  final second = int.parse(m.group(6)!);
  final ms = int.parse((m.group(7) ?? '0').padRight(3, '0').substring(0, 3));
  final offsetToken = m.group(8)!;
  final offSign = offsetToken.startsWith('-') ? -1 : 1;
  final offHour = int.parse(offsetToken.substring(1));
  final offMinute = int.parse(m.group(9)!);
  final offsetMinutes = offSign * (offHour * 60 + offMinute);
  final utcMillis = DateTime.utc(year, month, day, hour, minute, second, ms)
      .subtract(Duration(minutes: offsetMinutes))
      .millisecondsSinceEpoch;
  return DateTime.fromMillisecondsSinceEpoch(utcMillis);
}

/// `'18 Aug 2026, 10:35 AM'`, or `'—'` if [iso] is null/unparseable.
String formatDateTime(String? iso) {
  final dt = parseStoredIso(iso);
  if (dt == null) return '—';
  return '${formatDate(iso)}, ${formatTime(iso)}';
}

/// `'18 Aug 2026'`, or `'—'` if [iso] is null/unparseable.
String formatDate(String? iso) {
  final dt = parseStoredIso(iso);
  if (dt == null) return '—';
  return '${dt.day} ${_months[dt.month - 1]} ${dt.year}';
}

/// `'10:35 AM'`, or `'—'` if [iso] is null/unparseable.
String formatTime(String? iso) {
  final dt = parseStoredIso(iso);
  if (dt == null) return '—';
  final hour12 = dt.hour % 12 == 0 ? 12 : dt.hour % 12;
  final period = dt.hour < 12 ? 'AM' : 'PM';
  return '$hour12:${_pad2(dt.minute)} $period';
}

/// Whole nights between [fromIso] and [toIsoValue] (defaults to now — an
/// open-ended stay). Clamped to zero.
int nightsBetween(String fromIso, [String? toIsoValue]) {
  final from = parseStoredIso(fromIso);
  if (from == null) return 0;
  final to = toIsoValue != null ? parseStoredIso(toIsoValue) : DateTime.now();
  if (to == null) return 0;
  final nights = to.difference(from).inMilliseconds ~/ 86400000;
  return nights < 0 ? 0 : nights;
}

/// `YYYY-MM-DD-HHmm`, used for backup file names.
String backupStamp(DateTime date) => '${toDayKey(date)}-${_pad2(date.hour)}${_pad2(date.minute)}';

/// True if [iso] is more than [hours] ahead of [now].
bool isFutureBeyond(String iso, int hours, [DateTime? now]) {
  final dt = parseStoredIso(iso);
  if (dt == null) return false;
  final reference = now ?? DateTime.now();
  return dt.isAfter(reference.add(Duration(hours: hours)));
}
