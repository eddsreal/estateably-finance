import createClient from 'openapi-fetch';
import type { paths } from 'contract/src/types';

export const API_BASE_URL = 'http://localhost:3000';

export const api = createClient<paths>({
  baseUrl: API_BASE_URL,
  fetch: (input) => globalThis.fetch(input),
});

export async function unwrap<T>(
  call: Promise<{ data?: T; error?: unknown; response: Response }>,
): Promise<T> {
  const { data, error, response } = await call;
  if (error !== undefined) throw error;
  if (data === undefined && response.status !== 204) {
    throw new Error(`empty response with status ${response.status}`);
  }
  return data as T;
}
