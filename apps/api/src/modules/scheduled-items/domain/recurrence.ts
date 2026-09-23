import { addDays, addMonthsClamped } from '../../../common/dates/dates';

export type RecurrenceRule = 'once' | 'weekly' | 'monthly';

export type RecurringWindow = {
  nextDueDate: string;
  recurrence: RecurrenceRule;
  endDate?: string | null;
};

export function occurrenceAt(anchor: string, recurrence: RecurrenceRule, index: number): string {
  switch (recurrence) {
    case 'once':
      return anchor;
    case 'weekly':
      return addDays(anchor, index * 7);
    case 'monthly':
      return addMonthsClamped(anchor, index);
  }
}

export function expandOccurrences(item: RecurringWindow, until: string): string[] {
  const cutoff = item.endDate != null && item.endDate < until ? item.endDate : until;
  const dates: string[] = [];
  for (let index = 0; ; index += 1) {
    const date = occurrenceAt(item.nextDueDate, item.recurrence, index);
    if (date > cutoff) break;
    dates.push(date);
    if (item.recurrence === 'once') break;
  }
  return dates;
}

export function advance(nextDueDate: string, recurrence: RecurrenceRule): string | null {
  switch (recurrence) {
    case 'once':
      return null;
    case 'weekly':
      return addDays(nextDueDate, 7);
    case 'monthly':
      return addMonthsClamped(nextDueDate, 1);
  }
}

export function missedPeriods(item: RecurringWindow, today: string): number {
  return expandOccurrences(item, addDays(today, -1)).length;
}
