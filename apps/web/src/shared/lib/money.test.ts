import { describe, expect, it } from 'vitest';
import {
  addCents,
  Cents,
  compareCents,
  formatCents,
  formatPlain,
  isNegative,
  parseDollars,
  toCents,
} from './money';

describe('parseDollars (FR-027)', () => {
  it('accepts plain, comma-grouped and dollar-signed input', () => {
    expect(parseDollars('1234.5')).toBe('123450');
    expect(parseDollars('1,234.50')).toBe('123450');
    expect(parseDollars('$1,234.50')).toBe('123450');
    expect(parseDollars('42')).toBe('4200');
    expect(parseDollars(' -$500.00 ')).toBe('-50000');
    expect(parseDollars('-500')).toBe('-50000');
    expect(parseDollars('0')).toBe('0');
  });

  it('rejects more than two decimals and junk', () => {
    expect(parseDollars('1.234')).toBeNull();
    expect(parseDollars('1.2.3')).toBeNull();
    expect(parseDollars('abc')).toBeNull();
    expect(parseDollars('')).toBeNull();
    expect(parseDollars('12,34.00')).toBeNull();
    expect(parseDollars('$')).toBeNull();
  });

  it('rejects values beyond the ±10^15-cent guard', () => {
    expect(parseDollars('10000000000000.00')).toBe('1000000000000000');
    expect(parseDollars('10000000000000.01')).toBeNull();
  });
});

describe('toCents', () => {
  it('accepts wire strings inside the guard and rejects the rest', () => {
    expect(toCents('4250')).toBe('4250');
    expect(toCents('-50000')).toBe('-50000');
    expect(toCents('1000000000000001')).toBeNull();
    expect(toCents('4.2')).toBeNull();
    expect(toCents('')).toBeNull();
  });
});

describe('formatCents (FR-026)', () => {
  it('renders dollars with grouping, two decimals and an explicit minus', () => {
    expect(formatCents('123456' as Cents)).toBe('$1,234.56');
    expect(formatCents('-12000' as Cents)).toBe('-$120.00');
    expect(formatCents('0' as Cents)).toBe('$0.00');
    expect(formatCents('5' as Cents)).toBe('$0.05');
    expect(formatCents('1000000000000000' as Cents)).toBe('$10,000,000,000,000.00');
  });

  it('renders the plain variant without the currency sign', () => {
    expect(formatPlain('123450' as Cents)).toBe('1,234.50');
    expect(formatPlain('-50000' as Cents)).toBe('-500.00');
  });
});

describe('bigint arithmetic only', () => {
  it('adds and compares beyond Number.MAX_SAFE_INTEGER exactly', () => {
    const big = '900719925474099' as Cents;
    expect(addCents(big, '1' as Cents)).toBe('900719925474100');
    expect(compareCents('900719925474099' as Cents, '900719925474100' as Cents)).toBe(-1);
    expect(compareCents('10' as Cents, '9' as Cents)).toBe(1);
    expect(compareCents('10' as Cents, '10' as Cents)).toBe(0);
    expect(isNegative('-1' as Cents)).toBe(true);
    expect(isNegative('0' as Cents)).toBe(false);
  });
});
