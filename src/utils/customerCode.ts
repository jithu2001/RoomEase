/** Customer code generation: CUS-000001, CUS-000002, ... */

export const CODE_PREFIX = 'CUS-';
export const CODE_DIGITS = 6;
export const CODE_PATTERN = /^CUS-\d{6,}$/;

/** Formats a sequence number as a customer code. */
export function formatCustomerCode(sequence: number): string {
  if (!Number.isInteger(sequence) || sequence < 1) {
    throw new Error(`Invalid customer sequence: ${sequence}`);
  }
  return CODE_PREFIX + String(sequence).padStart(CODE_DIGITS, '0');
}

/** Returns the numeric part of a code, or null when it isn't a valid code. */
export function parseCustomerCode(code: string | null | undefined): number | null {
  if (!code || !CODE_PATTERN.test(code)) return null;
  const n = Number(code.slice(CODE_PREFIX.length));
  return Number.isFinite(n) && n > 0 ? n : null;
}

/**
 * Next code after `highestExisting` (the largest code currently in the
 * database, or null/invalid when the table is empty).
 */
export function nextCustomerCode(highestExisting: string | null | undefined): string {
  return formatCustomerCode((parseCustomerCode(highestExisting) ?? 0) + 1);
}

/** Codes are used as directory names — reject anything unexpected. */
export function isSafeCustomerCode(code: string): boolean {
  return CODE_PATTERN.test(code);
}
