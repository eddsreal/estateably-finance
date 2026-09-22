import { describe, expect, it } from 'vitest';
import {
  AiNotConfiguredError,
  AiProviderError,
  AiRateLimitedError,
  AiTimeoutError,
  ArchivedAccountError,
  ArchivedCategoryError,
  CategoryInUseError,
  CategoryTypeMismatchError,
  ClosedProjectError,
  DateRangeError,
  DomainError,
  DomainRuleViolationError,
  DuplicateNameError,
  FutureDateError,
  NotFoundError,
  OpeningKindChangeError,
  ProjectInUseError,
  ProjectOnNonExpenseError,
  SameAccountTransferError,
  ValidationFailedError,
} from './domain-errors';

describe('domain errors', () => {
  it('carries the R-011 code for each class', () => {
    expect(new ValidationFailedError([]).code).toBe('VALIDATION_FAILED');
    expect(new NotFoundError('Transaction', 42n).code).toBe('NOT_FOUND');
    expect(new DuplicateNameError('account', 'Checking').code).toBe('DUPLICATE_NAME');
    expect(new AiNotConfiguredError().code).toBe('AI_NOT_CONFIGURED');
    expect(new AiProviderError().code).toBe('AI_PROVIDER_ERROR');
    expect(new AiRateLimitedError().code).toBe('AI_RATE_LIMITED');
    expect(new AiTimeoutError(10000).code).toBe('AI_TIMEOUT');
  });

  it('maps every 422 rule of the catalogue to DOMAIN_RULE_VIOLATION', () => {
    const violations: DomainRuleViolationError[] = [
      new ArchivedAccountError('accountId', 3n),
      new ArchivedCategoryError(4n),
      new CategoryTypeMismatchError('expense'),
      new SameAccountTransferError(),
      new ClosedProjectError(5n),
      new ProjectOnNonExpenseError(),
      new ProjectInUseError(6n),
      new OpeningKindChangeError(),
      new CategoryInUseError(7n),
      new FutureDateError(),
      new DateRangeError('a date range must span at most 24 months'),
    ];
    for (const v of violations) {
      expect(v).toBeInstanceOf(DomainRuleViolationError);
      expect(v).toBeInstanceOf(DomainError);
      expect(v.code).toBe('DOMAIN_RULE_VIOLATION');
      expect(v.message.length).toBeGreaterThan(0);
    }
  });

  it('names the offending field where one is nameable', () => {
    expect(new SameAccountTransferError().details).toEqual([
      { field: 'counterAccountId', message: 'must differ from accountId' },
    ]);
    expect(new DuplicateNameError('account', 'Checking').details).toEqual([
      { field: 'name', message: 'name is already in use' },
    ]);
    expect(new CategoryTypeMismatchError('income').details?.[0].field).toBe('categoryId');
    expect(new FutureDateError('nextDueDate').details?.[0].field).toBe('nextDueDate');
  });

  it('writes human-readable messages with the offending id', () => {
    expect(new NotFoundError('Transaction', 42n).message).toBe('Transaction 42 does not exist');
    expect(new DuplicateNameError('account', 'Checking').message).toBe(
      'Account named "Checking" already exists',
    );
    expect(new ProjectInUseError(6n).message).toContain('close it instead');
    expect(new AiTimeoutError(10000).message).toBe('The LLM provider timed out after 10000 ms');
  });
});
