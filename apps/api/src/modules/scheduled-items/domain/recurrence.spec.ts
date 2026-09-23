import { describe, expect, it } from 'vitest';
import { advance, expandOccurrences, missedPeriods, occurrenceAt } from './recurrence';

describe('occurrenceAt', () => {
  it('keeps a once anchor fixed', () => {
    expect(occurrenceAt('2026-10-12', 'once', 0)).toBe('2026-10-12');
  });

  it('steps weekly by seven days', () => {
    expect(occurrenceAt('2026-10-01', 'weekly', 0)).toBe('2026-10-01');
    expect(occurrenceAt('2026-10-01', 'weekly', 4)).toBe('2026-10-29');
  });

  it('clamps a monthly anchor on the 31st to the last day of shorter months', () => {
    expect(occurrenceAt('2026-10-31', 'monthly', 1)).toBe('2026-11-30');
    expect(occurrenceAt('2026-10-31', 'monthly', 2)).toBe('2026-12-31');
    expect(occurrenceAt('2026-10-31', 'monthly', 4)).toBe('2027-02-28');
  });

  it('keeps a 29th or 30th anchor when the month is long enough', () => {
    expect(occurrenceAt('2026-10-30', 'monthly', 2)).toBe('2026-12-30');
    expect(occurrenceAt('2027-01-29', 'monthly', 1)).toBe('2027-02-28');
    expect(occurrenceAt('2027-01-29', 'monthly', 2)).toBe('2027-03-29');
  });
});

describe('expandOccurrences', () => {
  it('expands a weekly item across the horizon', () => {
    expect(
      expandOccurrences({ nextDueDate: '2026-10-01', recurrence: 'weekly' }, '2026-10-31'),
    ).toEqual(['2026-10-01', '2026-10-08', '2026-10-15', '2026-10-22', '2026-10-29']);
  });

  it('expands a monthly item once per month', () => {
    expect(
      expandOccurrences({ nextDueDate: '2026-10-01', recurrence: 'monthly' }, '2026-11-30'),
    ).toEqual(['2026-10-01', '2026-11-01']);
  });

  it('returns a single occurrence for once items inside the horizon', () => {
    expect(
      expandOccurrences({ nextDueDate: '2026-10-12', recurrence: 'once' }, '2026-11-30'),
    ).toEqual(['2026-10-12']);
  });

  it('returns nothing when the first occurrence is past the horizon', () => {
    expect(
      expandOccurrences({ nextDueDate: '2026-12-01', recurrence: 'monthly' }, '2026-11-30'),
    ).toEqual([]);
  });

  it('cuts off at the end date', () => {
    expect(
      expandOccurrences(
        { nextDueDate: '2026-10-01', recurrence: 'weekly', endDate: '2026-10-15' },
        '2026-12-31',
      ),
    ).toEqual(['2026-10-01', '2026-10-08', '2026-10-15']);
  });
});

describe('advance', () => {
  it('completes a once item', () => {
    expect(advance('2026-10-12', 'once')).toBeNull();
  });

  it('moves weekly items seven days and monthly items one clamped month', () => {
    expect(advance('2026-10-01', 'weekly')).toBe('2026-10-08');
    expect(advance('2026-10-01', 'monthly')).toBe('2026-11-01');
    expect(advance('2026-10-31', 'monthly')).toBe('2026-11-30');
  });
});

describe('missedPeriods', () => {
  it('counts one occurrence per missed period since the next due date', () => {
    expect(missedPeriods({ nextDueDate: '2026-07-15', recurrence: 'monthly' }, '2026-09-24')).toBe(
      3,
    );
  });

  it('counts a past once item exactly once', () => {
    expect(missedPeriods({ nextDueDate: '2026-09-01', recurrence: 'once' }, '2026-09-24')).toBe(1);
  });

  it('counts nothing when the item is due today or later', () => {
    expect(missedPeriods({ nextDueDate: '2026-09-24', recurrence: 'monthly' }, '2026-09-24')).toBe(
      0,
    );
  });
});
