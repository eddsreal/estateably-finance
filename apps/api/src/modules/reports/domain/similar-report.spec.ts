import { describe, expect, it } from 'vitest';
import { similarReport, SimilarRow } from './similar-report';

type Row = SimilarRow & { id: bigint };

function expense(id: bigint, description: string, amount: bigint): Row {
  return {
    id,
    description,
    entries: [
      { systemAccountId: null, amount: -amount },
      { systemAccountId: 10n, amount },
    ],
  };
}

describe('similarReport', () => {
  it('groups "Uber 1234", "UBER 5678" and "uber" into one group, others alone (US6 #1)', () => {
    const report = similarReport([
      expense(1n, 'Uber 1234', 1830n),
      expense(2n, 'UBER 5678', 2100n),
      expense(3n, 'uber', 950n),
      expense(4n, 'Netflix', 1599n),
      expense(5n, 'Rent', 120000n),
    ]);
    expect(report.groups.map((group) => [group.key, group.count, group.total])).toEqual([
      ['rent', 1, 120000n],
      ['uber', 3, 4880n],
      ['netflix', 1, 1599n],
    ]);
    expect(report.groups[1].transactions.map((row) => row.id)).toEqual([1n, 2n, 3n]);
  });

  it('keeps "Flat 4B" apart and groups a digits-only description as itself', () => {
    const report = similarReport([
      expense(1n, 'Flat 4B', 500n),
      expense(2n, 'Flat', 400n),
      expense(3n, '12345', 300n),
      expense(4n, ' 12345 ', 200n),
    ]);
    expect(report.groups.map((group) => [group.key, group.count])).toEqual([
      ['12345', 2],
      ['flat 4b', 1],
      ['flat', 1],
    ]);
  });

  it('highlights the five most expensive transactions and the most expensive group (US6 #2)', () => {
    const rows = [
      expense(1n, 'Coffee 1', 400n),
      expense(2n, 'Coffee 2', 400n),
      expense(3n, 'Coffee 3', 400n),
      expense(4n, 'Coffee 4', 400n),
      expense(5n, 'Laptop', 150000n),
      expense(6n, 'Phone', 90000n),
      expense(7n, 'Book', 2500n),
      expense(8n, 'Pen', 300n),
    ];
    const report = similarReport(rows);
    expect(report.topTransactions.map((row) => row.id)).toEqual([5n, 6n, 7n, 1n, 2n]);
    expect(report.topGroupKey).toBe('laptop');
  });

  it('breaks equal group totals by key so the order is stable', () => {
    const report = similarReport([expense(1n, 'Zoo', 100n), expense(2n, 'Aquarium', 100n)]);
    expect(report.groups.map((group) => group.key)).toEqual(['aquarium', 'zoo']);
  });

  it('answers the same report for the same data (US6 #4)', () => {
    const rows = [expense(1n, 'Uber 1', 100n), expense(2n, 'Bus', 100n), expense(3n, 'uber', 5n)];
    expect(similarReport(rows)).toEqual(similarReport(rows));
  });

  it('answers an empty period as an empty report (US6 #3)', () => {
    expect(similarReport([])).toEqual({ groups: [], topTransactions: [], topGroupKey: null });
  });

  it('never rewrites a stored description', () => {
    const row = expense(1n, 'UBER  5678', 100n);
    similarReport([row]);
    expect(row.description).toBe('UBER  5678');
  });
});
