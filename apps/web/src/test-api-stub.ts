import { vi } from 'vitest';

type RouteHandler = (url: URL, init?: RequestInit) => { status?: number; body: unknown } | Response;

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
        (input instanceof Request
          ? { method, body: await input.clone().text(), signal: input.signal }
          : undefined);
      const result =
        typeof route === 'function' ? (route as RouteHandler)(url, requestInit) : { body: route };
      if (result instanceof Response) return result;
      if (result.status === 204) return new Response(null, { status: 204 });
      return new Response(JSON.stringify(result.body), {
        status: result.status ?? 200,
        headers: { 'content-type': 'application/json' },
      });
    }),
  );
}

export type NarrativeStream = {
  response: Response;
  delta(text: string): void;
  end(data: { outcome: 'complete' | 'incomplete'; reason?: string }): void;
  close(): void;
};

export function narrativeStream(correlationId = 'stream-correlation-id'): NarrativeStream {
  const encoder = new TextEncoder();
  let sink!: ReadableStreamDefaultController<Uint8Array>;
  let open = true;
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      sink = controller;
    },
    cancel() {
      open = false;
    },
  });
  const send = (event: string, data: unknown) => {
    if (open) sink.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
  };
  const close = () => {
    if (open) sink.close();
    open = false;
  };
  return {
    response: new Response(body, {
      status: 200,
      headers: { 'content-type': 'text/event-stream', 'X-Correlation-Id': correlationId },
    }),
    delta: (text) => send('delta', { text }),
    end: (data) => {
      send('end', data);
      close();
    },
    close,
  };
}
