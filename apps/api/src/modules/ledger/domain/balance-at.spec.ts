import { describe, expect, it } from 'vitest';
import { balanceAt } from './balance-at';

const entries = [
  { date: '2026-09-01', amount: 150000n },
  { date: '2026-09-10', amount: -4250n },
  { date: '2026-09-12', amount: 300000n },
  { date: '2026-09-24', amount: -12000n },
];

describe('balanceAt', () => {
  it('answers 0 for a date before the first entry', () => {
    expect(balanceAt(entries, '2026-08-31')).toBe(0n);
  });

  it('sums entries dated on or before the asked date, inclusive', () => {
    expect(balanceAt(entries, '2026-09-10')).toBe(145750n);
  });

  it('answers the running value between two entries', () => {
    expect(balanceAt(entries, '2026-09-11')).toBe(145750n);
    expect(balanceAt(entries, '2026-09-12')).toBe(445750n);
  });

  it('answers the current balance for today', () => {
    expect(balanceAt(entries, '2026-09-24')).toBe(433750n);
  });

  it('answers 0 for no entries at all', () => {
    expect(balanceAt([], '2026-09-24')).toBe(0n);
  });
});
