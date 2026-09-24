import { afterEach, describe, expect, it, vi } from 'vitest';
import { addDays, formatDay, localToday, relativeDueLabel, upcomingGroup } from './dates';

describe('localToday', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("answers the browser's date as YYYY-MM-DD", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 8, 25, 23, 30));
    expect(localToday()).toBe('2026-09-25');
  });
});

describe('relativeDueLabel', () => {
  const today = '2026-09-25';

  it('names today, tomorrow and later days', () => {
    expect(relativeDueLabel('2026-09-25', today)).toBe('Today');
    expect(relativeDueLabel('2026-09-26', today)).toBe('Tomorrow');
    expect(relativeDueLabel('2026-10-09', today)).toBe('In 14 days');
  });

  it('marks overdue items, singular and plural', () => {
    expect(relativeDueLabel('2026-09-24', today)).toBe('⚠ Overdue 1 day');
    expect(relativeDueLabel('2026-09-20', today)).toBe('⚠ Overdue 5 days');
  });

  it('counts across a year end', () => {
    expect(relativeDueLabel('2027-01-02', '2026-12-30')).toBe('In 3 days');
    expect(relativeDueLabel('2026-12-30', '2027-01-01')).toBe('⚠ Overdue 2 days');
  });
});

describe('upcomingGroup', () => {
  it('puts overdue items and days 0 to 14 first', () => {
    const today = '2026-09-10';
    expect(upcomingGroup('2026-08-01', today)).toBe('overdue-and-2-weeks');
    expect(upcomingGroup('2026-09-10', today)).toBe('overdue-and-2-weeks');
    expect(upcomingGroup('2026-09-11', today)).toBe('overdue-and-2-weeks');
    expect(upcomingGroup('2026-09-24', today)).toBe('overdue-and-2-weeks');
  });

  it('puts day 15 in the rest of the month, then later months', () => {
    const today = '2026-09-10';
    expect(upcomingGroup('2026-09-25', today)).toBe('later-this-month');
    expect(upcomingGroup('2026-09-30', today)).toBe('later-this-month');
    expect(upcomingGroup('2026-10-01', today)).toBe('later-months');
  });

  it('keeps the 14-day window across a month end, leaving the rest of the month empty', () => {
    const today = '2026-09-25';
    expect(upcomingGroup('2026-09-30', today)).toBe('overdue-and-2-weeks');
    expect(upcomingGroup('2026-10-09', today)).toBe('overdue-and-2-weeks');
    expect(upcomingGroup('2026-10-10', today)).toBe('later-months');
  });

  it('crosses a year end', () => {
    expect(upcomingGroup('2027-01-05', '2026-12-28')).toBe('overdue-and-2-weeks');
    expect(upcomingGroup('2027-01-20', '2026-12-28')).toBe('later-months');
  });
});

describe('addDays', () => {
  it('moves across month, year and leap-day boundaries', () => {
    expect(addDays('2026-09-22', -29)).toBe('2026-08-24');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2028-03-01', -1)).toBe('2028-02-29');
    expect(addDays('2026-09-22', -364)).toBe('2025-09-23');
    expect(addDays('2026-09-22', 0)).toBe('2026-09-22');
  });
});

describe('formatDay', () => {
  it('names the day as "22 Sep 2026" whatever the browser zone', () => {
    expect(formatDay('2026-09-22')).toBe('22 Sep 2026');
    expect(formatDay('2027-01-01')).toBe('1 Jan 2027');
  });
});
