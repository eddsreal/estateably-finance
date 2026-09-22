import { describe, expect, it } from 'vitest';
import { LedgerInvariantError, toEntries } from './to-entries';

describe('toEntries', () => {
  it('expense: account −a, category system account +a', () => {
    expect(
      toEntries({ kind: 'expense', amount: 4250n, accountId: 1n, categorySystemAccountId: 10n }),
    ).toEqual([
      { accountId: 1n, systemAccountId: null, amount: -4250n },
      { accountId: null, systemAccountId: 10n, amount: 4250n },
    ]);
  });

  it('income: account +a, category system account −a', () => {
    expect(
      toEntries({ kind: 'income', amount: 300000n, accountId: 1n, categorySystemAccountId: 11n }),
    ).toEqual([
      { accountId: 1n, systemAccountId: null, amount: 300000n },
      { accountId: null, systemAccountId: 11n, amount: -300000n },
    ]);
  });

  it('transfer: source −a, destination +a', () => {
    expect(
      toEntries({ kind: 'transfer', amount: 50000n, accountId: 1n, counterAccountId: 2n }),
    ).toEqual([
      { accountId: 1n, systemAccountId: null, amount: -50000n },
      { accountId: 2n, systemAccountId: null, amount: 50000n },
    ]);
  });

  it('opening: account +s, equity −s, signed either way', () => {
    expect(
      toEntries({ kind: 'opening', amount: 150000n, accountId: 1n, equitySystemAccountId: 1n }),
    ).toEqual([
      { accountId: 1n, systemAccountId: null, amount: 150000n },
      { accountId: null, systemAccountId: 1n, amount: -150000n },
    ]);
    expect(
      toEntries({ kind: 'opening', amount: -50000n, accountId: 3n, equitySystemAccountId: 1n }),
    ).toEqual([
      { accountId: 3n, systemAccountId: null, amount: -50000n },
      { accountId: null, systemAccountId: 1n, amount: 50000n },
    ]);
  });

  it('every intent produces exactly two entries summing to zero', () => {
    const intents = [
      { kind: 'expense', amount: 1n, accountId: 1n, categorySystemAccountId: 2n },
      { kind: 'income', amount: 999999999999999n, accountId: 1n, categorySystemAccountId: 2n },
      { kind: 'transfer', amount: 7n, accountId: 1n, counterAccountId: 2n },
      { kind: 'opening', amount: -1n, accountId: 1n, equitySystemAccountId: 1n },
    ] as const;
    for (const intent of intents) {
      const entries = toEntries(intent);
      expect(entries).toHaveLength(2);
      expect(entries[0].amount + entries[1].amount).toBe(0n);
      expect(entries[0].amount).not.toBe(0n);
      expect(entries[1].amount).not.toBe(0n);
    }
  });

  it('rejects zero and negative amounts on expense, income and transfer', () => {
    for (const amount of [0n, -1n]) {
      expect(() =>
        toEntries({ kind: 'expense', amount, accountId: 1n, categorySystemAccountId: 2n }),
      ).toThrow(LedgerInvariantError);
      expect(() =>
        toEntries({ kind: 'income', amount, accountId: 1n, categorySystemAccountId: 2n }),
      ).toThrow(LedgerInvariantError);
      expect(() =>
        toEntries({ kind: 'transfer', amount, accountId: 1n, counterAccountId: 2n }),
      ).toThrow(LedgerInvariantError);
    }
  });

  it('rejects a zero opening amount', () => {
    expect(() =>
      toEntries({ kind: 'opening', amount: 0n, accountId: 1n, equitySystemAccountId: 1n }),
    ).toThrow(LedgerInvariantError);
  });

  it('rejects a transfer between the same account', () => {
    expect(() =>
      toEntries({ kind: 'transfer', amount: 100n, accountId: 1n, counterAccountId: 1n }),
    ).toThrow(LedgerInvariantError);
  });
});
