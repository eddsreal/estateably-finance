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
      const result =
        typeof route === 'function' ? (route as RouteHandler)(url, init) : { body: route };
      return new Response(JSON.stringify(result.body), {
        status: result.status ?? 200,
        headers: { 'content-type': 'application/json' },
      });
    }),
  );
}
