/** Pure client-side validation. No DOM, no DB — safe to unit test directly. */

import type { CustomerInput } from '../types';
import { parseAmountToMinor, validateAmount } from './money';
import { localInputToIso } from './date';

export type FieldErrors<T extends string = string> = Partial<Record<T, string>>;

export type CustomerField =
  | 'name'
  | 'address'
  | 'phone'
  | 'room_number'
  | 'number_of_persons'
  | 'id_front'
  | 'id_back'
  | 'amount'
  | 'check_in_date'
  | 'check_out_date';

export const LIMITS = {
  nameMin: 2,
  nameMax: 80,
  addressMin: 5,
  addressMax: 250,
  phoneMin: 7,
  phoneMax: 15,
  personsMin: 1,
  personsMax: 20,
} as const;

/** Keeps digits only, so `+91 98470-12345` counts as 12 digits. */
export function phoneDigits(phone: string): string {
  return phone.replace(/\D/g, '');
}

export function validateName(value: string): string | undefined {
  const v = value.trim();
  if (!v) return 'Customer name is required';
  if (v.length < LIMITS.nameMin) return 'Name looks too short';
  if (v.length > LIMITS.nameMax) return `Name must be under ${LIMITS.nameMax} characters`;
  return undefined;
}

export function validateAddress(value: string): string | undefined {
  const v = value.trim();
  if (!v) return 'Full address is required';
  if (v.length < LIMITS.addressMin) return 'Please enter the full address';
  if (v.length > LIMITS.addressMax) return `Address must be under ${LIMITS.addressMax} characters`;
  return undefined;
}

export function validatePhone(value: string): string | undefined {
  const v = value.trim();
  if (!v) return 'Phone number is required';
  if (!/^[+]?[\d\s\-()]+$/.test(v)) return 'Phone number contains invalid characters';
  const digits = phoneDigits(v);
  if (digits.length < LIMITS.phoneMin) return 'Phone number is too short';
  if (digits.length > LIMITS.phoneMax) return 'Phone number is too long';
  return undefined;
}

export function validateRoomNumber(value: string): string | undefined {
  if (!value.trim()) return 'Please select a room';
  return undefined;
}

export function validatePersons(value: number | string): string | undefined {
  const raw = typeof value === 'string' ? value.trim() : value;
  if (raw === '' || raw === null || raw === undefined) return 'Number of persons is required';
  const n = Number(raw);
  if (!Number.isFinite(n)) return 'Enter a valid number';
  if (!Number.isInteger(n)) return 'Number of persons must be a whole number';
  if (n < LIMITS.personsMin) return 'At least 1 person is required';
  if (n > LIMITS.personsMax) return `Maximum ${LIMITS.personsMax} persons per room`;
  return undefined;
}

/** Room labels are used as file-safe identifiers and must stay short. */
export function validateNewRoomNumber(
  value: string,
  existing: readonly string[],
): string | undefined {
  const v = value.trim();
  if (!v) return 'Room number is required';
  if (v.length > 10) return 'Room number must be 10 characters or fewer';
  if (!/^[A-Za-z0-9\-/ ]+$/.test(v)) return 'Use letters, numbers, spaces, - or / only';
  if (existing.some((r) => r.toLowerCase() === v.toLowerCase())) return 'That room already exists';
  return undefined;
}

/** How far ahead a hand-entered time may be, allowing for clock drift. */
export const MAX_FUTURE_HOURS = 24;

/** A time typed by staff: blank means "use the default". */
export function validateCheckInTime(value: string, now: Date = new Date()): string | undefined {
  if (!value.trim()) return 'Check-in date and time is required';
  const iso = localInputToIso(value);
  if (!iso) return 'Enter a valid date and time';
  const when = new Date(iso).getTime();
  if (when - now.getTime() > MAX_FUTURE_HOURS * 3_600_000) {
    return 'Check-in cannot be more than a day in the future';
  }
  if (new Date(iso).getFullYear() < 2000) return 'That date looks too far in the past';
  return undefined;
}

export function validateCheckOutTime(
  value: string,
  checkInValue: string,
  now: Date = new Date(),
): string | undefined {
  if (!value.trim()) return undefined; // still staying
  const iso = localInputToIso(value);
  if (!iso) return 'Enter a valid date and time';
  if (new Date(iso).getTime() - now.getTime() > MAX_FUTURE_HOURS * 3_600_000) {
    return 'Check-out cannot be more than a day in the future';
  }
  const checkInIso = localInputToIso(checkInValue);
  if (checkInIso && new Date(iso).getTime() < new Date(checkInIso).getTime()) {
    return 'Check-out cannot be before check-in';
  }
  return undefined;
}

export interface CustomerFormValues
  extends Omit<CustomerInput, 'number_of_persons' | 'amount_minor' | 'check_in_date' | 'check_out_date'> {
  number_of_persons: string | number;
  /** Raw text from the amount field; blank means "not recorded". */
  amount: string;
  /** `datetime-local` values (YYYY-MM-DDTHH:mm), local time. */
  check_in_at: string;
  check_out_at: string;
}

/**
 * Validates the whole check-in form. `hasIdFront` / `hasIdBack` describe
 * whether an image is present (either newly captured or already stored).
 */
export function validateCustomerForm(
  values: CustomerFormValues,
  opts: { hasIdFront: boolean; hasIdBack: boolean },
): FieldErrors<CustomerField> {
  const errors: FieldErrors<CustomerField> = {};
  const set = (field: CustomerField, message: string | undefined) => {
    if (message) errors[field] = message;
  };

  set('name', validateName(values.name));
  set('address', validateAddress(values.address));
  set('phone', validatePhone(values.phone));
  set('room_number', validateRoomNumber(values.room_number));
  set('number_of_persons', validatePersons(values.number_of_persons));
  set('amount', validateAmount(values.amount));
  set('check_in_date', validateCheckInTime(values.check_in_at));
  set('check_out_date', validateCheckOutTime(values.check_out_at, values.check_in_at));
  if (!opts.hasIdFront) set('id_front', 'ID proof front photo is required');
  if (!opts.hasIdBack) set('id_back', 'ID proof back photo is required');

  return errors;
}

export function hasErrors(errors: FieldErrors): boolean {
  return Object.values(errors).some(Boolean);
}

/** Normalises form values into the shape the service layer expects. */
export function normaliseCustomerInput(values: CustomerFormValues): CustomerInput {
  const amount = parseAmountToMinor(values.amount);
  const checkIn = localInputToIso(values.check_in_at);
  const checkOut = localInputToIso(values.check_out_at);
  return {
    name: values.name.trim().replace(/\s+/g, ' '),
    address: values.address.trim(),
    phone: values.phone.trim(),
    room_number: values.room_number.trim(),
    number_of_persons: Number(values.number_of_persons),
    // validateCustomerForm rejects unparseable input before this runs.
    amount_minor: amount === undefined ? null : amount,
    ...(checkIn ? { check_in_date: checkIn } : {}),
    ...(checkOut ? { check_out_date: checkOut } : {}),
  };
}

/* ------------------------------------------------------------------ */
/* Additional guests                                                   */
/* ------------------------------------------------------------------ */

export type GuestField = 'name' | 'phone';

/** The name is required once you start recording someone. */
export function validateGuestName(value: string): string | undefined {
  const v = value.trim();
  if (!v) return 'Guest name is required';
  if (v.length < LIMITS.nameMin) return 'Name looks too short';
  if (v.length > LIMITS.nameMax) return `Name must be under ${LIMITS.nameMax} characters`;
  return undefined;
}

/** Optional: a companion often has no separate number on file. */
export function validateGuestPhone(value: string): string | undefined {
  if (!value.trim()) return undefined;
  return validatePhone(value);
}

export function validateGuestForm(values: {
  name: string;
  phone: string;
}): FieldErrors<GuestField> {
  const errors: FieldErrors<GuestField> = {};
  const name = validateGuestName(values.name);
  if (name) errors.name = name;
  const phone = validateGuestPhone(values.phone);
  if (phone) errors.phone = phone;
  return errors;
}

export function normaliseGuestInput(values: { name: string; phone: string }): {
  name: string;
  phone: string | null;
} {
  const phone = values.phone.trim();
  return {
    name: values.name.trim().replace(/\s+/g, ' '),
    phone: phone === '' ? null : phone,
  };
}

export function validatePin(pin: string): string | undefined {
  if (!/^\d{4,8}$/.test(pin)) return 'PIN must be 4 to 8 digits';
  return undefined;
}
