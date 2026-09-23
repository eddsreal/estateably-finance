import { describe, expect, it } from 'vitest';
import { addDays, addMonthsClamped, spanExceedsMonths, toDate, toDateOnly, todayIn } from './dates';

describe('dates', () => {
  it('round-trips a date-only string through Date', () => {
    expect(toDateOnly(toDate('2026-09-10'))).toBe('2026-09-10');
  });

  it('answers today as YYYY-MM-DD in the requested timezone', () => {
    expect(todayIn('UTC')).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('adds months clamping to the last day of shorter months', () => {
    expect(addDays('2026-09-28', 7)).toBe('2026-10-05');
    expect(addDays('2026-01-01', -1)).toBe('2025-12-31');
    expect(addMonthsClamped('2026-01-31', 1)).toBe('2026-02-28');
    expect(addMonthsClamped('2026-01-15', 1)).toBe('2026-02-15');
    expect(addMonthsClamped('2024-12-31', 2)).toBe('2025-02-28');
  });

  it('flags ranges longer than the month cap and accepts the boundary', () => {
    expect(spanExceedsMonths('2024-09-24', '2026-09-24', 24)).toBe(false);
    expect(spanExceedsMonths('2024-09-24', '2026-09-25', 24)).toBe(true);
    expect(spanExceedsMonths('2026-09-01', '2026-09-30', 24)).toBe(false);
  });
});
