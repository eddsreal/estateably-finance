import { randomUUID } from 'node:crypto';

export const CORRELATION_ID_HEADER = 'X-Correlation-Id';

export type WithCorrelationId = { correlationId?: string };

export function correlationIdOf(req: unknown): string {
  return (req as WithCorrelationId).correlationId ?? 'unknown';
}

export function correlationIdMiddleware(
  req: object,
  res: { setHeader(name: string, value: string): void },
  next: () => void,
): void {
  const id = randomUUID();
  (req as WithCorrelationId).correlationId = id;
  res.setHeader(CORRELATION_ID_HEADER, id);
  next();
}
