import { describe, expect, it } from 'vitest';
import {
  addCents,
  Cents,
  change,
  compareCents,
  countUpFrames,
  formatCents,
  formatPlain,
  isNegative,
  parseDollars,
  share,
  toCents,
  toPlotNumber,
  toPlotSeries,
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

describe('change', () => {
  it('subtracts in bigint, keeping the sign of the move', () => {
    expect(change('100000' as Cents, '112000' as Cents)).toBe('12000');
    expect(change('112000' as Cents, '100000' as Cents)).toBe('-12000');
    expect(change('5' as Cents, '5' as Cents)).toBe('0');
    expect(change('-900719925474099' as Cents, '900719925474100' as Cents)).toBe(
      '1801439850948199',
    );
  });
});

describe('countUpFrames', () => {
  it('returns 61 integer frames whose endpoints are exact', () => {
    const frames = countUpFrames('0' as Cents, '395750' as Cents);
    expect(frames).toHaveLength(61);
    expect(frames[0]).toBe('0');
    expect(frames[60]).toBe('395750');
    expect(frames.every((frame) => /^-?\d+$/.test(frame))).toBe(true);
  });

  it('counts down through negatives and stays flat on a zero range', () => {
    const down = countUpFrames('1000' as Cents, '-50001' as Cents);
    expect(down[0]).toBe('1000');
    expect(down[60]).toBe('-50001');
    expect(down.every((frame, k) => k === 0 || BigInt(frame) <= BigInt(down[k - 1]))).toBe(true);
    expect(new Set(countUpFrames('-7' as Cents, '-7' as Cents))).toEqual(new Set(['-7']));
  });

  it('stays exact beyond Number.MAX_SAFE_INTEGER', () => {
    const frames = countUpFrames('0' as Cents, '900719925474099300' as Cents);
    expect(frames[30]).toBe('450359962737049650');
    expect(frames[60]).toBe('900719925474099300');
  });
});

describe('toPlotNumber', () => {
  it('maps min to 0, max to the height and is monotonic between them', () => {
    const values = ['-50000', '-1', '0', '1', '120000', '445750'] as Cents[];
    const ys = values.map((value) =>
      toPlotNumber(value, '-50000' as Cents, '445750' as Cents, 200),
    );
    expect(ys[0]).toBe(0);
    expect(ys[ys.length - 1]).toBe(200);
    expect(ys.every((y, i) => i === 0 || y > ys[i - 1])).toBe(true);
  });

  it('centres a flat series', () => {
    expect(toPlotNumber('500' as Cents, '500' as Cents, '500' as Cents, 24)).toBe(12);
  });
});

describe('toPlotSeries', () => {
  it('scales a series into 0…1 by its own extremes, flat series in the middle', () => {
    expect(toPlotSeries(['-100', '0', '300'] as Cents[])).toEqual([0, 0.25, 1]);
    expect(toPlotSeries(['7', '7'] as Cents[])).toEqual([0.5, 0.5]);
    expect(toPlotSeries(['42'] as Cents[])).toEqual([0.5]);
  });
});

describe('share (FR-009)', () => {
  const sum = (shares: string[]) => shares.reduce((total, value) => total + Number(value) * 10, 0);

  it('splits three equal totals into exactly 100.0%, the extra tenth to the first', () => {
    const shares = share(['100', '100', '100'] as Cents[]);
    expect(shares).toEqual(['33.4', '33.3', '33.3']);
    expect(sum(shares)).toBe(1000);
  });

  it('gives the leftover tenths to the largest remainders', () => {
    expect(share(['1', '1', '1', '1', '1', '1', '1'] as Cents[])).toEqual([
      '14.3',
      '14.3',
      '14.3',
      '14.3',
      '14.3',
      '14.3',
      '14.2',
    ]);
    expect(share(['132000', '110000', '9640', '5440', '4250', '3480', '1599'] as Cents[])).toEqual([
      '49.6',
      '41.3',
      '3.6',
      '2.0',
      '1.6',
      '1.3',
      '0.6',
    ]);
  });

  it('breaks ties by input order and adds up for awkward splits', () => {
    expect(share(['1', '2'] as Cents[])).toEqual(['33.3', '66.7']);
    expect(share(['2', '1'] as Cents[])).toEqual(['66.7', '33.3']);
    for (const totals of [
      ['1', '1', '1'],
      ['7', '7', '7', '7', '7', '7'],
      ['999999', '1'],
    ]) {
      expect(sum(share(totals as Cents[]))).toBe(1000);
    }
  });

  it('returns 0.0 for every share of a zero grand total and 100.0 for a single total', () => {
    expect(share(['0', '0'] as Cents[])).toEqual(['0.0', '0.0']);
    expect(share(['4250'] as Cents[])).toEqual(['100.0']);
  });
});
