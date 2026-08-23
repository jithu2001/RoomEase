/**
 * Money handling for the optional booking amount.
 *
 * Amounts are stored as an INTEGER number of minor units (paise), never as a
 * float: 0.1 + 0.2 problems have no place in a record of what a guest paid.
 *
 * Formatting is done by hand rather than through Intl so the output is identical
 * on every device and in tests — ICU data differs between Android versions, and
 * grouping is the one thing that would silently change.
 */

/** Change this one constant to use a different currency. */
export const CURRENCY_SYMBOL = '₹';

/** Two decimal places, i.e. 100 paise to the rupee. */
export const MINOR_UNITS_PER_MAJOR = 100;

/** Generous ceiling that still catches a slipped decimal point or typo. */
export const MAX_AMOUNT_MINOR = 100_000_000; // 1,000,000.00

/**
 * Parses user input into minor units.
 * Returns null for blank input (the field is optional).
 * Throws nothing — invalid input yields `undefined`, which callers treat as an error.
 */
export function parseAmountToMinor(input: string): number | null | undefined {
  const cleaned = input
    .replace(CURRENCY_SYMBOL, '')
    .replace(/[\s,]/g, '')
    .trim();
  if (cleaned === '') return null;

  // Optional single decimal point with at most two digits after it.
  if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) return undefined;

  const [whole, fraction = ''] = cleaned.split('.');
  const minor =
    Number(whole) * MINOR_UNITS_PER_MAJOR + Number(fraction.padEnd(2, '0'));
  if (!Number.isSafeInteger(minor) || minor > MAX_AMOUNT_MINOR) return undefined;
  return minor;
}

/** Groups digits in threes, e.g. 1234567 -> "1,234,567". */
function groupThousands(digits: string): string {
  let out = '';
  for (let i = 0; i < digits.length; i += 1) {
    if (i > 0 && (digits.length - i) % 3 === 0) out += ',';
    out += digits[i];
  }
  return out;
}

/** `₹1,500.00`, or an em dash when there is no amount. */
export function formatMinor(minor: number | null | undefined): string {
  if (minor === null || minor === undefined || !Number.isFinite(minor)) return '—';
  const negative = minor < 0;
  const abs = Math.abs(Math.round(minor));
  const major = Math.floor(abs / MINOR_UNITS_PER_MAJOR);
  const fraction = String(abs % MINOR_UNITS_PER_MAJOR).padStart(2, '0');
  return `${negative ? '-' : ''}${CURRENCY_SYMBOL}${groupThousands(String(major))}.${fraction}`;
}

/** Value for an editable text field: "1500.00", or '' when unset. */
export function minorToInput(minor: number | null | undefined): string {
  if (minor === null || minor === undefined || !Number.isFinite(minor)) return '';
  const abs = Math.round(minor);
  const major = Math.floor(abs / MINOR_UNITS_PER_MAJOR);
  return `${major}.${String(abs % MINOR_UNITS_PER_MAJOR).padStart(2, '0')}`;
}

/** Field-level validation message, or undefined when acceptable (incl. blank). */
export function validateAmount(input: string): string | undefined {
  const parsed = parseAmountToMinor(input);
  if (parsed === undefined) {
    return `Enter an amount like 1500 or 1500.50 (up to ${formatMinor(MAX_AMOUNT_MINOR)})`;
  }
  return undefined;
}
