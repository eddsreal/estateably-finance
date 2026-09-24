export type UpcomingGroup = 'overdue-and-2-weeks' | 'later-this-month' | 'later-months';

const DAY_MS = 86_400_000;

export function localToday(): string {
  return new Intl.DateTimeFormat('en-CA').format(new Date());
}

function daysBetween(from: string, to: string): number {
  return Math.round(
    (new Date(`${to}T00:00:00Z`).getTime() - new Date(`${from}T00:00:00Z`).getTime()) / DAY_MS,
  );
}

export function relativeDueLabel(due: string, today: string): string {
  const diff = daysBetween(today, due);
  if (diff < 0) return diff === -1 ? '⚠ Overdue 1 day' : `⚠ Overdue ${-diff} days`;
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Tomorrow';
  return `In ${diff} days`;
}

export function upcomingGroup(due: string, today: string): UpcomingGroup {
  if (daysBetween(today, due) <= 14) return 'overdue-and-2-weeks';
  if (due.slice(0, 7) === today.slice(0, 7)) return 'later-this-month';
  return 'later-months';
}
