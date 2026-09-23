import type { FieldValues, Path, UseFormSetError } from 'react-hook-form';

export type ApiError = {
  code: string;
  message: string;
  details?: { field: string; message: string }[];
  correlationId: string;
};

export function isApiError(value: unknown): value is ApiError {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as ApiError).code === 'string' &&
    typeof (value as ApiError).message === 'string' &&
    typeof (value as ApiError).correlationId === 'string'
  );
}

export function applyServerError<T extends FieldValues>(
  error: unknown,
  setError: UseFormSetError<T>,
  fields: readonly string[],
): string | null {
  if (!isApiError(error)) {
    return 'The request failed. Check that the API is running and try again.';
  }
  let unmapped = false;
  for (const detail of error.details ?? []) {
    if (fields.includes(detail.field)) {
      setError(detail.field as Path<T>, { type: 'server', message: detail.message });
    } else {
      unmapped = true;
    }
  }
  if ((error.details?.length ?? 0) === 0 || unmapped) {
    return `${error.code}: ${error.message} (ref ${error.correlationId})`;
  }
  return null;
}
