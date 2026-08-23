import { describe, expect, it } from 'vitest';
import {
  formatCustomerCode,
  isSafeCustomerCode,
  nextCustomerCode,
  parseCustomerCode,
} from '../src/utils/customerCode';

describe('customer code generation', () => {
  it('formats sequences with six digits', () => {
    expect(formatCustomerCode(1)).toBe('CUS-000001');
    expect(formatCustomerCode(2)).toBe('CUS-000002');
    expect(formatCustomerCode(42)).toBe('CUS-000042');
    expect(formatCustomerCode(999999)).toBe('CUS-999999');
  });

  it('keeps growing past six digits without losing order', () => {
    expect(formatCustomerCode(1000000)).toBe('CUS-1000000');
    expect(parseCustomerCode('CUS-1000000')).toBe(1000000);
  });

  it('rejects invalid sequences', () => {
    expect(() => formatCustomerCode(0)).toThrow();
    expect(() => formatCustomerCode(-3)).toThrow();
    expect(() => formatCustomerCode(1.5)).toThrow();
  });

  it('starts at CUS-000001 for an empty database', () => {
    expect(nextCustomerCode(null)).toBe('CUS-000001');
    expect(nextCustomerCode(undefined)).toBe('CUS-000001');
    expect(nextCustomerCode('')).toBe('CUS-000001');
  });

  it('increments the highest existing code', () => {
    expect(nextCustomerCode('CUS-000001')).toBe('CUS-000002');
    expect(nextCustomerCode('CUS-000099')).toBe('CUS-000100');
    expect(nextCustomerCode('CUS-999999')).toBe('CUS-1000000');
  });

  it('ignores unparseable codes rather than crashing', () => {
    expect(parseCustomerCode('GUEST-1')).toBeNull();
    expect(parseCustomerCode('CUS-abc')).toBeNull();
    expect(nextCustomerCode('nonsense')).toBe('CUS-000001');
  });

  it('only treats well-formed codes as safe directory names', () => {
    expect(isSafeCustomerCode('CUS-000001')).toBe(true);
    expect(isSafeCustomerCode('../etc')).toBe(false);
    expect(isSafeCustomerCode('CUS-000001/../..')).toBe(false);
  });
});
