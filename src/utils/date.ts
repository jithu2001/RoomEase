/**
 * Date helpers.
 *
 * Timestamps are stored as ISO 8601 strings that carry the *device local*
 * time plus its UTC offset, e.g. `2026-08-18T10:35:00.000+05:30`.
 *
 * Storing local time (rather than UTC) means the first 10 characters are the
 * local calendar day, so "today's check-ins" is a cheap indexed prefix
 * comparison in SQL and never drifts across the UTC midnight boundary.
 */

const MONTHS = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

function pad(n: number, len = 2): string {
  return String(Math.abs(n)).padStart(len, '0');
}

function offsetSuffix(date: Date): string {
  const minutes = -date.getTimezoneOffset();
  const sign = minutes < 0 ? '-' : '+';
  return `${sign}${pad(Math.floor(Math.abs(minutes) / 60))}:${pad(Math.abs(minutes) % 60)}`;
}

/** ISO 8601 timestamp for `date` (default: now) in device local time. */
export function toIso(date: Date = new Date()): string {
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` +
    `T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}` +
    `.${pad(date.getMilliseconds(), 3)}${offsetSuffix(date)}`
  );
}

/** Current local timestamp in ISO 8601. Used for every audit column. */
export function nowIso(): string {
  return toIso(new Date());
}

/** Local calendar day as `YYYY-MM-DD`. */
export function toDayKey(date: Date = new Date()): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** The `YYYY-MM-DD` part of a stored ISO timestamp. */
export function dayKeyOf(iso: string | null | undefined): string {
  return iso ? iso.slice(0, 10) : '';
}

function parse(iso: string | null | undefined): Date | null {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** `18 Aug 2026, 10:35 AM` — the display format used throughout the UI. */
export function formatDateTime(iso: string | null | undefined): string {
  const d = parse(iso);
  if (!d) return '—';
  const hours24 = d.getHours();
  const suffix = hours24 < 12 ? 'AM' : 'PM';
  const hours12 = hours24 % 12 === 0 ? 12 : hours24 % 12;
  return (
    `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}, ` +
    `${hours12}:${pad(d.getMinutes())} ${suffix}`
  );
}

/** `18 Aug 2026` */
export function formatDate(iso: string | null | undefined): string {
  const d = parse(iso);
  if (!d) return '—';
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

/** `10:35 AM` */
export function formatTime(iso: string | null | undefined): string {
  const d = parse(iso);
  if (!d) return '—';
  const hours24 = d.getHours();
  const suffix = hours24 < 12 ? 'AM' : 'PM';
  const hours12 = hours24 % 12 === 0 ? 12 : hours24 % 12;
  return `${hours12}:${pad(d.getMinutes())} ${suffix}`;
}

/** Whole nights between check-in and check-out (or now), minimum 0. */
export function nightsBetween(fromIso: string, toIsoValue?: string | null): number {
  const from = parse(fromIso);
  const to = parse(toIsoValue ?? undefined) ?? new Date();
  if (!from) return 0;
  const ms = to.getTime() - from.getTime();
  return Math.max(0, Math.floor(ms / 86_400_000));
}

/** `hotel-backup-2026-08-18.zip` style filename stamp. */
export function backupStamp(date: Date = new Date()): string {
  return `${toDayKey(date)}-${pad(date.getHours())}${pad(date.getMinutes())}`;
}

/* ------------------------------------------------------------------ */
/* <input type="datetime-local"> bridging                              */
/* ------------------------------------------------------------------ */

/**
 * Formats a stored timestamp for an `<input type="datetime-local">`, which
 * requires exactly `YYYY-MM-DDTHH:mm` in *local* time and no offset.
 */
export function isoToLocalInput(iso: string | null | undefined): string {
  const d = parse(iso);
  if (!d) return '';
  return (
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` +
    `T${pad(d.getHours())}:${pad(d.getMinutes())}`
  );
}

/**
 * Converts a `datetime-local` value back to a stored ISO timestamp.
 * Returns null when the value is blank or not a real date/time.
 */
export function localInputToIso(value: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value.trim())) return null;
  // `new Date('2026-08-18T10:35')` is interpreted as local time, which is what
  // the picker means and what we store.
  const d = new Date(value.trim());
  if (Number.isNaN(d.getTime())) return null;
  return toIso(d);
}

/** Now, rounded down to the minute, ready for a datetime-local field. */
export function nowLocalInput(): string {
  return isoToLocalInput(nowIso());
}

/** True when `iso` is more than `hours` in the future. */
export function isFutureBeyond(iso: string, hours: number, now: Date = new Date()): boolean {
  const d = parse(iso);
  if (!d) return false;
  return d.getTime() - now.getTime() > hours * 3_600_000;
}
