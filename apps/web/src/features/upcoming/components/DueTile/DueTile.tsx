import { relativeDueLabel, upcomingGroup } from '../../../../shared/lib/dates';

const PART = (date: string, option: 'month' | 'day') =>
  new Intl.DateTimeFormat('en-US', {
    [option]: option === 'month' ? 'short' : 'numeric',
    timeZone: 'UTC',
  })
    .format(new Date(`${date}T00:00:00Z`))
    .toUpperCase();

export function shortDay(date: string): string {
  return `${PART(date, 'month')} ${PART(date, 'day')}`;
}

export function DueTile({ date }: { date: string }) {
  return (
    <time
      dateTime={date}
      className="flex h-52 w-48 flex-none flex-col items-center justify-center rounded-lg bg-sand-100"
    >
      <span className="font-mono text-10 tracking-wider text-text-3">{PART(date, 'month')}</span>
      <span className="text-20 leading-(--spacing-22) font-semibold">{PART(date, 'day')}</span>
    </time>
  );
}

export function DueChip({ due, today, extra }: { due: string; today: string; extra?: string }) {
  const tone =
    due < today
      ? 'bg-negative-soft font-semibold text-negative-strong'
      : upcomingGroup(due, today) === 'overdue-and-2-weeks'
        ? 'bg-ink-900 font-medium text-text-on-ink'
        : 'bg-sand-200 font-medium text-text-2';
  return (
    <span
      className={`inline-flex h-26 flex-none items-center rounded-pill px-10 text-12 whitespace-nowrap ${tone}`}
    >
      {relativeDueLabel(due, today)}
      {extra}
    </span>
  );
}
