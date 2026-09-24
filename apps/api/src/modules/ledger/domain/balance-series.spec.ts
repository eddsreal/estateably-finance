import { describe, expect, it } from 'vitest';
import { addDays } from '../../../common/dates/dates';
import { balanceAt } from './balance-at';
import { balanceSeries } from './balance-series';

const entries = [
  { date: '2026-09-01', amount: 150000n },
  { date: '2026-09-10', amount: -4250n },
  { date: '2026-09-12', amount: 300000n },
  { date: '2026-09-12', amount: -500n },
  { date: '2026-09-24', amount: -12000n },
];

function expectEqualsBalanceAt(list: typeof entries, from: string, to: string): bigint[] {
  const series = balanceSeries(list, from, to);
  series.forEach((value, i) => expect(value).toBe(balanceAt(list, addDays(from, i))));
  expect(addDays(from, series.length - 1)).toBe(to);
  return series;
}

describe('balanceSeries', () => {
  it('equals balanceAt on every day of the range', () => {
    expect(expectEqualsBalanceAt(entries, '2026-08-25', '2026-09-30')).toHaveLength(37);
  });

  it('is all zeros before the first entry', () => {
    expect(balanceSeries(entries, '2026-08-01', '2026-08-05')).toEqual([0n, 0n, 0n, 0n, 0n]);
  });

  it('is a flat line over a range with no entries', () => {
    expect(balanceSeries(entries, '2026-09-13', '2026-09-16')).toEqual([
      445250n,
      445250n,
      445250n,
      445250n,
    ]);
  });

  it('starts from the balance built by entries dated before the range', () => {
    const backdated = [...entries, { date: '2025-01-15', amount: 7000n }];
    const series = expectEqualsBalanceAt(backdated, '2026-09-10', '2026-09-12');
    expect(series).toEqual([152750n, 152750n, 452250n]);
  });

  it('answers one value when from equals to', () => {
    expect(balanceSeries(entries, '2026-09-12', '2026-09-12')).toEqual([445250n]);
  });

  it('crosses a month end and a year end', () => {
    const list = [
      { date: '2025-12-31', amount: 100n },
      { date: '2026-01-01', amount: 20n },
      { date: '2026-02-01', amount: -5n },
    ];
    const series = expectEqualsBalanceAt(list, '2025-12-30', '2026-02-02');
    expect(series).toHaveLength(35);
    expect(series[0]).toBe(0n);
    expect(series[1]).toBe(100n);
    expect(series[2]).toBe(120n);
    expect(series.at(-1)).toBe(115n);
  });

  it('answers zeros for no entries at all', () => {
    expect(balanceSeries([], '2026-09-01', '2026-09-03')).toEqual([0n, 0n, 0n]);
  });
});
