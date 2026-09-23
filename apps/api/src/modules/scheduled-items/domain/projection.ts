import { expandOccurrences, RecurrenceRule } from './recurrence';

export type ProjectionItem = {
  id: bigint;
  kind: 'bill' | 'income';
  description: string;
  amount: bigint;
  nextDueDate: string;
  recurrence: RecurrenceRule;
  endDate: string | null;
};

export type ProjectionOccurrence = {
  date: string;
  scheduledItemId: bigint;
  description: string;
  kind: 'bill' | 'income';
  amount: bigint;
  runningBalance: bigint;
  overdue: boolean;
};

export type Projection = {
  startingBalance: bigint;
  finalBalance: bigint;
  occurrences: ProjectionOccurrence[];
};

export function buildProjection(
  startingBalance: bigint,
  items: ProjectionItem[],
  today: string,
  horizon: string,
): Projection {
  const expanded: Omit<ProjectionOccurrence, 'runningBalance'>[] = [];
  for (const item of items) {
    for (const date of expandOccurrences(item, horizon)) {
      expanded.push({
        date,
        scheduledItemId: item.id,
        description: item.description,
        kind: item.kind,
        amount: item.amount,
        overdue: date < today,
      });
    }
  }
  expanded.sort((a, b) =>
    a.date < b.date
      ? -1
      : a.date > b.date
        ? 1
        : a.scheduledItemId < b.scheduledItemId
          ? -1
          : a.scheduledItemId > b.scheduledItemId
            ? 1
            : 0,
  );
  let running = startingBalance;
  const occurrences = expanded.map((occurrence) => {
    running += occurrence.kind === 'bill' ? -occurrence.amount : occurrence.amount;
    return { ...occurrence, runningBalance: running };
  });
  return { startingBalance, finalBalance: running, occurrences };
}
