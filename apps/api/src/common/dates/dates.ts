export function toDate(date: string): Date {
  return new Date(`${date}T00:00:00Z`);
}

export function toDateOnly(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function todayIn(timezone: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: timezone, dateStyle: 'short' }).format(
    new Date(),
  );
}

export function appToday(): string {
  return todayIn(process.env.APP_TIMEZONE ?? 'UTC');
}

export function addDays(date: string, days: number): string {
  const base = toDate(date);
  base.setUTCDate(base.getUTCDate() + days);
  return toDateOnly(base);
}

export function addMonthsClamped(date: string, months: number): string {
  const base = toDate(date);
  const day = base.getUTCDate();
  const target = new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth() + months, 1));
  const lastDay = new Date(
    Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0),
  ).getUTCDate();
  target.setUTCDate(Math.min(day, lastDay));
  return toDateOnly(target);
}

export function spanExceedsMonths(from: string, to: string, months: number): boolean {
  return to > addMonthsClamped(from, months);
}
