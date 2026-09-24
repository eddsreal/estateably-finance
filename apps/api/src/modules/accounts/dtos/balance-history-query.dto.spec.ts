import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ValidationFailedError } from '../../../common/domain-errors/domain-errors';
import { IncludeArchivedQueryDto } from './account-request.dto';
import { BalanceHistoryQueryDto, BalanceHistoryQueryPipe } from './balance-history-query.dto';

const pipe = new BalanceHistoryQueryPipe();

function query(plain: Record<string, unknown>): BalanceHistoryQueryDto {
  return plainToInstance(BalanceHistoryQueryDto, plain);
}

function failedField(plain: Record<string, unknown>): string | undefined {
  try {
    pipe.transform(query(plain));
    return undefined;
  } catch (error) {
    return error instanceof ValidationFailedError ? error.details?.[0].field : 'unexpected error';
  }
}

describe('BalanceHistoryQueryDto', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-25T12:00:00Z'));
    vi.stubEnv('APP_TIMEZONE', 'UTC');
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
  });

  it('accepts no dates at all and parses includeArchived as listAccounts does', () => {
    for (const raw of [undefined, 'true', 'false']) {
      const plain = raw === undefined ? {} : { includeArchived: raw };
      const dto = query(plain);
      const reference = plainToInstance(IncludeArchivedQueryDto, plain);
      expect(dto.includeArchived).toBe(reference.includeArchived);
      expect(validateSync(dto)).toEqual([]);
    }
    expect(validateSync(query({ includeArchived: 'yes' })).map((e) => e.property)).toEqual([
      'includeArchived',
    ]);
  });

  it('rejects malformed dates', () => {
    const errors = validateSync(query({ from: '2026-02-30', to: '2026-9-1' }));
    expect(errors.map((error) => error.property).sort()).toEqual(['from', 'to']);
  });

  it('rejects to after today, and accepts today', () => {
    expect(failedField({ to: '2026-09-26' })).toBe('to');
    expect(failedField({ to: '2026-09-25' })).toBeUndefined();
  });

  it('rejects from after to, also when to defaults to today', () => {
    expect(failedField({ from: '2026-09-11', to: '2026-09-10' })).toBe('from');
    expect(failedField({ from: '2026-09-26' })).toBe('from');
    expect(failedField({ from: '2026-09-10', to: '2026-09-10' })).toBeUndefined();
  });

  it('accepts a span of exactly 10 years and rejects one day more', () => {
    expect(failedField({ from: '2016-09-20', to: '2026-09-20' })).toBeUndefined();
    expect(failedField({ from: '2016-09-19', to: '2026-09-20' })).toBe('from');
    expect(failedField({ from: '2016-09-25' })).toBeUndefined();
    expect(failedField({ from: '2016-09-24' })).toBe('from');
  });
});
