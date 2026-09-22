import {
  CallHandler,
  ConsoleLogger,
  ExecutionContext,
  Injectable,
  LogLevel,
  NestInterceptor,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { correlationIdOf } from '../correlation-id.middleware/correlation-id.middleware';

const LEVELS: Record<string, LogLevel[]> = {
  error: ['error'],
  warn: ['error', 'warn'],
  info: ['error', 'warn', 'log'],
  debug: ['error', 'warn', 'log', 'debug'],
  verbose: ['error', 'warn', 'log', 'debug', 'verbose'],
};

export function logLevels(): LogLevel[] {
  return LEVELS[process.env.LOG_LEVEL ?? 'info'] ?? LEVELS.info;
}

export function buildLogger(): ConsoleLogger {
  return new ConsoleLogger({ json: true, logLevels: logLevels() });
}

type FinishableResponse = {
  statusCode: number;
  once(event: 'finish', listener: () => void): void;
};

type RoutedRequest = {
  method: string;
  route?: { path?: string };
  originalUrl?: string;
};

@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  private readonly logger = buildLogger();

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const http = context.switchToHttp();
    const req = http.getRequest<RoutedRequest>();
    const res = http.getResponse<FinishableResponse>();
    const start = process.hrtime.bigint();
    res.once('finish', () => {
      const durationMs = Number((process.hrtime.bigint() - start) / 1_000_000n);
      this.logger.log({
        correlationId: correlationIdOf(req),
        method: req.method,
        route: req.route?.path ?? (req.originalUrl ?? '').split('?')[0],
        status: res.statusCode,
        durationMs,
      });
    });
    return next.handle();
  }
}
