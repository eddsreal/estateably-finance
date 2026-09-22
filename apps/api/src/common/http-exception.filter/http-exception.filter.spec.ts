import { ArgumentsHost, NotFoundException, ValidationError } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import {
  AiNotConfiguredError,
  AiProviderError,
  AiRateLimitedError,
  AiTimeoutError,
  DuplicateNameError,
  NotFoundError,
  SameAccountTransferError,
  ValidationFailedError,
} from '../domain-errors/domain-errors';
import { ErrorResponseBody, HttpExceptionFilter, validationFailed } from './http-exception.filter';

function run(exception: unknown): { status: number; body: ErrorResponseBody } {
  const filter = new HttpExceptionFilter();
  let status = 0;
  let body: ErrorResponseBody | undefined;
  const host = {
    switchToHttp: () => ({
      getRequest: () => ({ correlationId: 'cid-1' }),
      getResponse: () => ({
        status: (code: number) => {
          status = code;
          return {
            json: (b: ErrorResponseBody) => {
              body = b;
            },
          };
        },
      }),
    }),
  } as unknown as ArgumentsHost;
  filter.catch(exception, host);
  if (!body) throw new Error('filter wrote no body');
  return { status, body };
}

describe('HttpExceptionFilter', () => {
  it('maps the full R-011 catalogue to its status codes', () => {
    expect(run(new ValidationFailedError([])).status).toBe(400);
    expect(run(new NotFoundError('Account', 1n)).status).toBe(404);
    expect(run(new DuplicateNameError('account', 'Cash')).status).toBe(409);
    expect(run(new SameAccountTransferError()).status).toBe(422);
    expect(run(new AiNotConfiguredError()).status).toBe(422);
    expect(run(new AiProviderError()).status).toBe(502);
    expect(run(new AiRateLimitedError()).status).toBe(503);
    expect(run(new AiTimeoutError(10000)).status).toBe(504);
  });

  it('answers the frozen ErrorResponse shape with the correlation id', () => {
    const { body } = run(new SameAccountTransferError());
    expect(body).toEqual({
      code: 'DOMAIN_RULE_VIOLATION',
      message: 'A transfer cannot use the same account as source and destination',
      details: [{ field: 'counterAccountId', message: 'must differ from accountId' }],
      correlationId: 'cid-1',
    });
  });

  it('omits details when the error carries none', () => {
    const { body } = run(new NotFoundError('Transaction', 9n));
    expect('details' in body).toBe(false);
  });

  it('maps a Nest HttpException by status, keeping its message', () => {
    const { status, body } = run(new NotFoundException('Cannot GET /nowhere'));
    expect(status).toBe(404);
    expect(body.code).toBe('NOT_FOUND');
    expect(body.message).toBe('Cannot GET /nowhere');
  });

  it('answers 500 INTERNAL_ERROR for anything unmapped and logs the stack', () => {
    const filter = new HttpExceptionFilter();
    const errorLog = vi
      .spyOn((filter as unknown as { logger: { error(entry: unknown): void } }).logger, 'error')
      .mockImplementation(() => undefined);
    let status = 0;
    let body: ErrorResponseBody | undefined;
    const host = {
      switchToHttp: () => ({
        getRequest: () => ({ correlationId: 'cid-2' }),
        getResponse: () => ({
          status: (code: number) => {
            status = code;
            return {
              json: (b: ErrorResponseBody) => {
                body = b;
              },
            };
          },
        }),
      }),
    } as unknown as ArgumentsHost;
    filter.catch(new Error('boom'), host);
    expect(status).toBe(500);
    expect(body).toEqual({
      code: 'INTERNAL_ERROR',
      message: 'Something went wrong',
      correlationId: 'cid-2',
    });
    expect(errorLog).toHaveBeenCalledWith(
      expect.objectContaining({ correlationId: 'cid-2', stack: expect.stringContaining('boom') }),
    );
  });

  it('flattens class-validator errors into dot-separated field details', () => {
    const nested: ValidationError = {
      property: 'amount',
      constraints: { isMoney: 'amount must be a positive integer number of cents' },
    };
    const parent: ValidationError = {
      property: 'intent',
      children: [nested],
    };
    const error = validationFailed([parent]);
    expect(error.code).toBe('VALIDATION_FAILED');
    expect(error.details).toEqual([
      { field: 'intent.amount', message: 'amount must be a positive integer number of cents' },
    ]);
  });
});
