import { describe, expect, it } from 'vitest';
import { monthlyReport, ReportRow } from './monthly-report';

type Row = ReportRow & { id: bigint };

function expense(id: bigint, categoryId: bigint, amount: bigint): Row {
  return {
    id,
    kind: 'expense',
    entries: [
      { accountId: 1n, systemAccountId: null, amount: -amount, systemAccount: null },
      { accountId: null, systemAccountId: 10n, amount, systemAccount: { categoryId } },
    ],
  };
}

function income(id: bigint, categoryId: bigint, amount: bigint): Row {
  return {
    id,
    kind: 'income',
    entries: [
      { accountId: 1n, systemAccountId: null, amount, systemAccount: null },
      { accountId: null, systemAccountId: 11n, amount: -amount, systemAccount: { categoryId } },
    ],
  };
}

function transfer(id: bigint, amount: bigint): Row {
  return {
    id,
    kind: 'transfer',
    entries: [
      { accountId: 1n, systemAccountId: null, amount: -amount, systemAccount: null },
      { accountId: 2n, systemAccountId: null, amount, systemAccount: null },
    ],
  };
}

const groceries = 5n;
const rent = 6n;

describe('monthlyReport', () => {
  it('groups expenses per category with summed totals and a grand total (US3 #1)', () => {
    const report = monthlyReport([
      expense(1n, groceries, 4250n),
      expense(2n, groceries, 3000n),
      expense(3n, rent, 12000n),
    ]);
    expect(report.groups.map((group) => [group.categoryId, group.total])).toEqual([
      [rent, 12000n],
      [groceries, 7250n],
    ]);
    expect(report.grandTotal).toBe(19250n);
  });

  it('keeps each group’s transactions in input order for drill-down (US3 #3)', () => {
    const first = expense(1n, groceries, 4250n);
    const second = expense(2n, groceries, 3000n);
    const report = monthlyReport([first, second]);
    expect(report.groups[0].transactions.map((row) => row.id)).toEqual([1n, 2n]);
  });

  it('leaves income and transfers out by construction (FR-013)', () => {
    const report = monthlyReport([
      expense(1n, groceries, 4250n),
      income(2n, 9n, 300000n),
      transfer(3n, 50000n),
    ]);
    expect(report.groups).toHaveLength(1);
    expect(report.groups[0].categoryId).toBe(groceries);
    expect(report.grandTotal).toBe(4250n);
  });

  it('omits categories without activity (US3 #6)', () => {
    const report = monthlyReport([expense(1n, rent, 12000n)]);
    expect(report.groups.map((group) => group.categoryId)).toEqual([rent]);
  });

  it('answers an empty report with a zero grand total for no rows (US3 #2)', () => {
    expect(monthlyReport([])).toEqual({ grandTotal: 0n, groups: [] });
  });

  it('orders groups by total descending, ties by category id', () => {
    const report = monthlyReport([
      expense(1n, 7n, 100n),
      expense(2n, 3n, 100n),
      expense(3n, 5n, 200n),
    ]);
    expect(report.groups.map((group) => group.categoryId)).toEqual([5n, 3n, 7n]);
  });
});
