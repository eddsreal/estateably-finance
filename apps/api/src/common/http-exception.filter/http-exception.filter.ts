import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  ValidationError,
} from '@nestjs/common';
import { correlationIdOf } from '../correlation-id.middleware/correlation-id.middleware';
import {
  DomainError,
  ErrorCode,
  ErrorDetail,
  ValidationFailedError,
} from '../domain-errors/domain-errors';
import { buildLogger } from '../logging.interceptor/logging.interceptor';

export type ErrorResponseBody = {
  code: ErrorCode;
  message: string;
  details?: ErrorDetail[];
  correlationId: string;
};

const STATUS_BY_CODE: Record<ErrorCode, number> = {
  VALIDATION_FAILED: 400,
  NOT_FOUND: 404,
  DUPLICATE_NAME: 409,
  DOMAIN_RULE_VIOLATION: 422,
  AI_NOT_CONFIGURED: 422,
  AI_PROVIDER_ERROR: 502,
  AI_RATE_LIMITED: 503,
  AI_TIMEOUT: 504,
  INTERNAL_ERROR: 500,
};

const CODE_BY_STATUS: Record<number, ErrorCode> = {
  400: 'VALIDATION_FAILED',
  404: 'NOT_FOUND',
  409: 'DUPLICATE_NAME',
  422: 'DOMAIN_RULE_VIOLATION',
};

export function validationFailed(errors: ValidationError[]): ValidationFailedError {
  const details: ErrorDetail[] = [];
  const walk = (error: ValidationError, path: string): void => {
    const field = path ? `${path}.${error.property}` : error.property;
    for (const message of Object.values(error.constraints ?? {})) {
      details.push({ field, message });
    }
    for (const child of error.children ?? []) {
      walk(child, field);
    }
  };
  for (const error of errors) {
    walk(error, '');
  }
  return new ValidationFailedError(details);
}

type JsonResponse = { status(code: number): { json(body: ErrorResponseBody): void } };

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = buildLogger();

  catch(exception: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const correlationId = correlationIdOf(http.getRequest());
    const res = http.getResponse<JsonResponse>();

    if (exception instanceof DomainError) {
      res.status(STATUS_BY_CODE[exception.code]).json({
        code: exception.code,
        message: exception.message,
        ...(exception.details && exception.details.length > 0
          ? { details: exception.details }
          : {}),
        correlationId,
      });
      return;
    }

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const code = CODE_BY_STATUS[status];
      if (code) {
        res.status(status).json({ code, message: exception.message, correlationId });
        return;
      }
    }

    this.logger.error({
      correlationId,
      message: exception instanceof Error ? exception.message : String(exception),
      stack: exception instanceof Error ? exception.stack : undefined,
    });
    res
      .status(500)
      .json({ code: 'INTERNAL_ERROR', message: 'Something went wrong', correlationId });
  }
}
