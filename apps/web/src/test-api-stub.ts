import { vi } from 'vitest';

type RouteHandler = (url: URL, init?: RequestInit) => { status?: number; body: unknown };

export type Routes = Record<string, unknown>;

export function stubApi(routes: Routes): void {
  vi.stubGlobal(
    'fetch',
    vi.fn<typeof fetch>(async (input, init?) => {
      const url = new URL(input instanceof Request ? input.url : input.toString());
      const method = (
        init?.method ?? (input instanceof Request ? input.method : 'GET')
      ).toUpperCase();
      const key = `${method} ${url.pathname}`;
      const route = routes[key];
      if (route === undefined) {
        return new Response(JSON.stringify({ message: `no stub for ${key}` }), { status: 500 });
      }
      const requestInit =
        init ??
        (input instanceof Request ? { method, body: await input.clone().text() } : undefined);
      const result =
        typeof route === 'function' ? (route as RouteHandler)(url, requestInit) : { body: route };
      if (result.status === 204) return new Response(null, { status: 204 });
      return new Response(JSON.stringify(result.body), {
        status: result.status ?? 200,
        headers: { 'content-type': 'application/json' },
      });
    }),
  );
}
