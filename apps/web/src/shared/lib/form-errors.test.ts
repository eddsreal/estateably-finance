import type { UseFormSetError } from 'react-hook-form';
import { describe, expect, it, vi } from 'vitest';
import { applyServerError } from './form-errors';

const error = {
  code: 'VALIDATION_FAILED',
  message: 'Validation failed',
  details: [{ field: 'amount', message: 'amount must be a positive integer number of cents' }],
  correlationId: '6f1b0c1e-8a24-4a5f-9b6d-2f3a7c1d9e10',
};

describe('applyServerError (SC-011)', () => {
  it('maps field details onto the matching fields and still names the correlation id', () => {
    const setError = vi.fn<UseFormSetError<Record<string, unknown>>>();
    const formLevel = applyServerError(error, setError, ['amount', 'date']);
    expect(setError).toHaveBeenCalledWith('amount', {
      type: 'server',
      message: 'amount must be a positive integer number of cents',
    });
    expect(formLevel).toBe(`VALIDATION_FAILED: Validation failed (ref ${error.correlationId})`);
  });

  it('surfaces field-less errors at form level with the correlation id', () => {
    const setError = vi.fn<UseFormSetError<Record<string, unknown>>>();
    const formLevel = applyServerError(
      { code: 'DOMAIN_RULE_VIOLATION', message: 'Project 9 is closed', correlationId: 'abc-123' },
      setError,
      ['amount'],
    );
    expect(setError).not.toHaveBeenCalled();
    expect(formLevel).toBe('DOMAIN_RULE_VIOLATION: Project 9 is closed (ref abc-123)');
  });

  it('keeps the form-level message when a detail names an unknown field', () => {
    const setError = vi.fn<UseFormSetError<Record<string, unknown>>>();
    const formLevel = applyServerError(error, setError, ['date']);
    expect(setError).not.toHaveBeenCalled();
    expect(formLevel).toContain('VALIDATION_FAILED');
    expect(formLevel).toContain(error.correlationId);
  });

  it('answers a generic message for non-API failures such as a refused connection', () => {
    const setError = vi.fn<UseFormSetError<Record<string, unknown>>>();
    const formLevel = applyServerError(new TypeError('fetch failed'), setError, []);
    expect(formLevel).toContain('request failed');
  });
});
