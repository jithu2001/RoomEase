import { describe, expect, it } from 'vitest';
import {
  CURRENCY_SYMBOL,
  MAX_AMOUNT_MINOR,
  formatMinor,
  minorToInput,
  parseAmountToMinor,
  validateAmount,
} from '../src/utils/money';

describe('parsing an amount', () => {
  it('treats a blank field as "not recorded"', () => {
    expect(parseAmountToMinor('')).toBeNull();
    expect(parseAmountToMinor('   ')).toBeNull();
    expect(validateAmount('')).toBeUndefined();
  });

  it('accepts whole rupees', () => {
    expect(parseAmountToMinor('1500')).toBe(150000);
    expect(parseAmountToMinor('0')).toBe(0);
  });

  it('accepts one or two decimals', () => {
    expect(parseAmountToMinor('1500.5')).toBe(150050);
    expect(parseAmountToMinor('1500.50')).toBe(150050);
    expect(parseAmountToMinor('0.05')).toBe(5);
  });

  it('tolerates separators and the currency symbol', () => {
    expect(parseAmountToMinor(' 1,500.50 ')).toBe(150050);
    expect(parseAmountToMinor(`${CURRENCY_SYMBOL}2500`)).toBe(250000);
    expect(parseAmountToMinor('1 500')).toBe(150000);
  });

  it('rejects nonsense rather than guessing', () => {
    for (const bad of ['abc', '15.005', '-500', '1.2.3', '15-', '1e5', '.']) {
      expect(parseAmountToMinor(bad)).toBeUndefined();
      expect(validateAmount(bad)).toBeTruthy();
    }
  });

  it('rejects an implausibly large amount (a slipped decimal point)', () => {
    expect(parseAmountToMinor('999999999999')).toBeUndefined();
    expect(parseAmountToMinor(String(MAX_AMOUNT_MINOR / 100))).toBe(MAX_AMOUNT_MINOR);
  });

  it('never loses precision through float arithmetic', () => {
    // 0.1 + 0.2 in minor units must be exactly 30 paise.
    expect(parseAmountToMinor('0.10')! + parseAmountToMinor('0.20')!).toBe(30);
    expect(parseAmountToMinor('99999.99')).toBe(9999999);
  });
});

describe('formatting an amount', () => {
  it('shows a dash when nothing was recorded', () => {
    expect(formatMinor(null)).toBe('—');
    expect(formatMinor(undefined)).toBe('—');
  });

  it('always shows two decimals with grouping', () => {
    expect(formatMinor(0)).toBe(`${CURRENCY_SYMBOL}0.00`);
    expect(formatMinor(150000)).toBe(`${CURRENCY_SYMBOL}1,500.00`);
    expect(formatMinor(150050)).toBe(`${CURRENCY_SYMBOL}1,500.50`);
    expect(formatMinor(5)).toBe(`${CURRENCY_SYMBOL}0.05`);
    expect(formatMinor(123456789)).toBe(`${CURRENCY_SYMBOL}1,234,567.89`);
  });

  it('round-trips through the edit field', () => {
    for (const minor of [0, 5, 99, 150000, 150050, 99999999]) {
      expect(parseAmountToMinor(minorToInput(minor))).toBe(minor);
    }
    expect(minorToInput(null)).toBe('');
  });
});
