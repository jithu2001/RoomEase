import { describe, expect, it } from 'vitest';
import {
  hasErrors,
  normaliseCustomerInput,
  validateCustomerForm,
  validateNewRoomNumber,
  validatePersons,
  validatePhone,
  validatePin,
} from '../src/utils/validation';

const complete = {
  name: 'Anoob Suresh',
  address: '12 Beach Road, Kochi',
  phone: '9847012345',
  room_number: '101',
  number_of_persons: 2,
  amount: '',
  // A fixed past date: valid forever, and keeps these assertions deterministic.
  check_in_at: '2026-08-18T10:35',
  check_out_at: '',
};

const bothIds = { hasIdFront: true, hasIdBack: true };

describe('customer form validation', () => {
  it('accepts a complete form', () => {
    expect(validateCustomerForm(complete, bothIds)).toEqual({});
    expect(hasErrors(validateCustomerForm(complete, bothIds))).toBe(false);
  });

  it('requires every customer field', () => {
    const errors = validateCustomerForm(
      {
        name: '',
        address: '',
        phone: '',
        room_number: '',
        number_of_persons: '',
        amount: '',
        check_in_at: '',
        check_out_at: '',
      },
      { hasIdFront: false, hasIdBack: false },
    );
    // The amount is optional, so it must NOT appear here.
    expect(Object.keys(errors).sort()).toEqual(
      [
        'address',
        'check_in_date',
        'id_back',
        'id_front',
        'name',
        'number_of_persons',
        'phone',
        'room_number',
      ].sort(),
    );
  });

  it('requires both ID photos', () => {
    expect(validateCustomerForm(complete, { hasIdFront: false, hasIdBack: true }).id_front).toBeDefined();
    expect(validateCustomerForm(complete, { hasIdFront: true, hasIdBack: false }).id_back).toBeDefined();
  });

  it('validates phone number length using digits only', () => {
    expect(validatePhone('+91 98470-12345')).toBeUndefined();
    expect(validatePhone('12345')).toMatch(/too short/i);
    expect(validatePhone('1234567890123456789')).toMatch(/too long/i);
    expect(validatePhone('call me')).toMatch(/invalid/i);
  });

  it('requires a positive whole number of persons', () => {
    expect(validatePersons(1)).toBeUndefined();
    expect(validatePersons('4')).toBeUndefined();
    expect(validatePersons(0)).toMatch(/at least 1/i);
    expect(validatePersons(-2)).toMatch(/at least 1/i);
    expect(validatePersons(2.5)).toMatch(/whole number/i);
    expect(validatePersons('two')).toMatch(/valid number/i);
    expect(validatePersons(99)).toMatch(/maximum/i);
  });

  it('normalises whitespace and numbers before saving', () => {
    const input = normaliseCustomerInput({
      name: '  Anoob   Suresh ',
      address: '  12 Beach Road  ',
      phone: ' 9847012345 ',
      room_number: ' 101 ',
      number_of_persons: '3',
      amount: ' 1,500.50 ',
      check_in_at: '2026-08-18T10:35',
      check_out_at: '',
    });
    expect(input).toEqual({
      name: 'Anoob Suresh',
      address: '12 Beach Road',
      phone: '9847012345',
      room_number: '101',
      number_of_persons: 3,
      amount_minor: 150050,
      check_in_date: '2026-08-18T10:35:00.000' + input.check_in_date!.slice(-6),
    });
  });
});

describe('room number validation', () => {
  it('rejects duplicates case-insensitively', () => {
    expect(validateNewRoomNumber('101', ['101'])).toMatch(/already exists/i);
    expect(validateNewRoomNumber('a1', ['A1'])).toMatch(/already exists/i);
  });

  it('rejects empty and unsafe labels', () => {
    expect(validateNewRoomNumber('  ', [])).toMatch(/required/i);
    expect(validateNewRoomNumber('../secret', [])).toMatch(/letters, numbers/i);
    expect(validateNewRoomNumber('1234567890123', [])).toMatch(/10 characters/i);
  });

  it('accepts realistic labels', () => {
    expect(validateNewRoomNumber('101', [])).toBeUndefined();
    expect(validateNewRoomNumber('A-12', [])).toBeUndefined();
    expect(validateNewRoomNumber('Suite 1', [])).toBeUndefined();
  });
});

describe('pin validation', () => {
  it('requires 4 to 8 digits', () => {
    expect(validatePin('1234')).toBeUndefined();
    expect(validatePin('12345678')).toBeUndefined();
    expect(validatePin('123')).toMatch(/4 to 8/);
    expect(validatePin('12a4')).toMatch(/4 to 8/);
  });
});
