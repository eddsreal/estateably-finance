import { describe, expect, it } from 'vitest';
import { buildProjection, ProjectionItem } from './projection';

const TODAY = '2026-09-24';

function item(overrides: Partial<ProjectionItem>): ProjectionItem {
  return {
    id: 1n,
    kind: 'bill',
    description: 'Rent',
    amount: 120000n,
    nextDueDate: '2026-10-01',
    recurrence: 'monthly',
    endDate: null,
    ...overrides,
  };
}

describe('buildProjection', () => {
  it('applies the US4 items to one horizon', () => {
    const projection = buildProjection(
      445750n,
      [
        item({ id: 1n, description: 'Rent', amount: 120000n }),
        item({
          id: 2n,
          kind: 'income',
          description: 'Salary',
          amount: 300000n,
          nextDueDate: '2026-10-05',
        }),
        item({
          id: 3n,
          description: 'Flight',
          amount: 80000n,
          nextDueDate: '2026-10-12',
          recurrence: 'once',
        }),
      ],
      TODAY,
      '2026-10-31',
    );
    expect(projection.startingBalance).toBe(445750n);
    expect(projection.finalBalance).toBe(545750n);
    expect(projection.occurrences.map((occurrence) => occurrence.runningBalance)).toEqual([
      325750n,
      625750n,
      545750n,
    ]);
  });

  it('counts monthly items once per month up to a longer horizon', () => {
    const projection = buildProjection(
      445750n,
      [
        item({ id: 1n, amount: 120000n }),
        item({
          id: 2n,
          kind: 'income',
          description: 'Salary',
          amount: 300000n,
          nextDueDate: '2026-10-05',
        }),
        item({
          id: 3n,
          description: 'Flight',
          amount: 80000n,
          recurrence: 'once',
          nextDueDate: '2026-10-12',
        }),
      ],
      TODAY,
      '2026-11-30',
    );
    expect(projection.finalBalance).toBe(725750n);
  });

  it('places overdue occurrences at the start, one per missed period', () => {
    const projection = buildProjection(
      100000n,
      [
        item({ id: 7n, description: 'Water', amount: 6050n, nextDueDate: '2026-08-15' }),
        item({
          id: 8n,
          description: 'Flight',
          amount: 80000n,
          nextDueDate: '2026-10-12',
          recurrence: 'once',
        }),
      ],
      TODAY,
      '2026-10-31',
    );
    expect(
      projection.occurrences.map((occurrence) => [occurrence.date, occurrence.overdue]),
    ).toEqual([
      ['2026-08-15', true],
      ['2026-09-15', true],
      ['2026-10-12', false],
      ['2026-10-15', false],
    ]);
  });

  it('marks an item due today as not overdue and still counts it', () => {
    const projection = buildProjection(
      1000n,
      [item({ nextDueDate: TODAY, recurrence: 'once', amount: 2000n })],
      TODAY,
      '2026-10-31',
    );
    expect(projection.occurrences).toEqual([
      expect.objectContaining({ date: TODAY, overdue: false, runningBalance: -1000n }),
    ]);
  });

  it('stops at the end date and orders same-day occurrences by item id', () => {
    const projection = buildProjection(
      0n,
      [
        item({
          id: 2n,
          kind: 'income',
          amount: 500n,
          nextDueDate: '2026-10-01',
          recurrence: 'weekly',
          endDate: '2026-10-08',
        }),
        item({ id: 1n, amount: 300n, nextDueDate: '2026-10-01', recurrence: 'once' }),
      ],
      TODAY,
      '2026-12-31',
    );
    expect(
      projection.occurrences.map((occurrence) => [occurrence.date, occurrence.scheduledItemId]),
    ).toEqual([
      ['2026-10-01', 1n],
      ['2026-10-01', 2n],
      ['2026-10-08', 2n],
    ]);
    expect(projection.finalBalance).toBe(700n);
  });

  it('returns the starting balance as final when nothing is scheduled', () => {
    const projection = buildProjection(445750n, [], TODAY, '2026-10-31');
    expect(projection.finalBalance).toBe(445750n);
    expect(projection.occurrences).toEqual([]);
  });
});
