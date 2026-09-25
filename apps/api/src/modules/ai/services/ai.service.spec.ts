import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  AiNotConfiguredError,
  AiProviderError,
  AiRateLimitedError,
  AiTimeoutError,
} from '../../../common/domain-errors/domain-errors';
import { ReportsService, SimilarReportData } from '../../reports/services/reports.service';
import { AiService, LLM_MODEL, NarrativeEvent } from './ai.service';

const report: SimilarReportData = {
  from: '2026-09-01',
  to: '2026-09-30',
  groups: [
    { key: 'rent', count: 1, total: 120000n, transactions: [] },
    { key: 'uber', count: 3, total: 5490n, transactions: [] },
  ],
  topTransactions: [],
  topGroupKey: 'rent',
};

type Provider = {
  send(event: string, data: unknown): void;
  text(text: string): void;
  finish(stopReason: string): void;
  close(): void;
};

function provider(script?: (p: Provider) => void): { response: (init?: RequestInit) => Response } {
  return {
    response: (init) => {
      const encoder = new TextEncoder();
      let sink!: ReadableStreamDefaultController<Uint8Array>;
      let closed = false;
      const body = new ReadableStream<Uint8Array>({
        start(controller) {
          sink = controller;
        },
      });
      const p: Provider = {
        send(event, data) {
          if (!closed)
            sink.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
        },
        text(text) {
          p.send('content_block_delta', {
            type: 'content_block_delta',
            index: 0,
            delta: { type: 'text_delta', text },
          });
        },
        finish(stopReason) {
          p.send('content_block_stop', { type: 'content_block_stop', index: 0 });
          p.send('message_delta', {
            type: 'message_delta',
            delta: { stop_reason: stopReason, stop_sequence: null },
            usage: { output_tokens: 1 },
          });
          p.send('message_stop', { type: 'message_stop' });
          p.close();
        },
        close() {
          if (!closed) sink.close();
          closed = true;
        },
      };
      init?.signal?.addEventListener('abort', () => {
        if (!closed) sink.error(new DOMException('aborted', 'AbortError'));
        closed = true;
      });
      p.send('message_start', {
        type: 'message_start',
        message: {
          id: 'msg_1',
          type: 'message',
          role: 'assistant',
          model: LLM_MODEL,
          content: [],
          stop_reason: null,
          stop_sequence: null,
          usage: { input_tokens: 1, output_tokens: 0 },
        },
      });
      p.send('content_block_start', {
        type: 'content_block_start',
        index: 0,
        content_block: { type: 'text', text: '' },
      });
      script?.(p);
      return new Response(body, { status: 200, headers: { 'content-type': 'text/event-stream' } });
    },
  };
}

function answer(pieces: string[], stopReason: string) {
  return provider((p) => {
    pieces.forEach((piece) => p.text(piece));
    p.finish(stopReason);
  });
}

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function build() {
  const reports = {
    similar: vi.fn<() => Promise<SimilarReportData>>().mockResolvedValue(report),
  };
  const fetchMock = vi.fn<typeof fetch>();
  vi.stubGlobal('fetch', fetchMock);
  return { service: new AiService(reports as unknown as ReportsService), reports, fetchMock };
}

function serve(
  fetchMock: ReturnType<typeof build>['fetchMock'],
  stub: ReturnType<typeof provider>,
) {
  fetchMock.mockImplementation(async (_url, init) => stub.response(init));
}

async function collect(
  service: AiService,
  signal = new AbortController().signal,
): Promise<NarrativeEvent[]> {
  const events: NarrativeEvent[] = [];
  for await (const event of service.similarNarrative('2026-09-01', '2026-09-30', signal)) {
    events.push(event);
  }
  return events;
}

describe('AiService.similarNarrative', () => {
  beforeEach(() => {
    vi.stubEnv('LLM_API_KEY', 'test-key');
    vi.stubEnv('LLM_BASE_URL', 'http://stub.local');
    vi.stubEnv('LLM_TIMEOUT_MS', '2500');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it('answers AI_NOT_CONFIGURED without any network call when the key is empty', async () => {
    vi.stubEnv('LLM_API_KEY', '');
    const { service, fetchMock, reports } = build();
    await expect(collect(service)).rejects.toBeInstanceOf(AiNotConfiguredError);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(reports.similar).not.toHaveBeenCalled();
  });

  it('yields every delta in order, then end complete, from one call to /v1/messages', async () => {
    const { service, fetchMock, reports } = build();
    serve(fetchMock, answer(['Rent ', 'led', '.'], 'end_turn'));
    await expect(collect(service)).resolves.toEqual([
      { type: 'delta', text: 'Rent ' },
      { type: 'delta', text: 'led' },
      { type: 'delta', text: '.' },
      { type: 'end', outcome: 'complete' },
    ]);
    expect(reports.similar).toHaveBeenCalledWith('2026-09-01', '2026-09-30');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('http://stub.local/v1/messages');
    const headers = new Headers(init?.headers);
    expect(headers.get('x-api-key')).toBe('test-key');
    expect(headers.get('anthropic-version')).toBe('2023-06-01');
    const body = JSON.parse(init?.body as string);
    expect(body.model).toBe('claude-haiku-4-5-20251001');
    expect(body.stream).toBe(true);
    const data = JSON.parse(body.messages[0].content);
    expect(data.periodTotalCents).toBe('125490');
    expect(data.transactionCount).toBe(4);
    expect(data.mostExpensiveGroup).toBe('rent');
    expect(data.groups[1]).toEqual({ description: 'uber', count: 3, totalCents: '5490' });
  });

  it.each([
    ['max_tokens', 'length'],
    ['refusal', 'provider_error'],
    ['stop_sequence', 'provider_error'],
  ])('maps stop reason %s after text to incomplete / %s', async (stopReason, reason) => {
    const { service, fetchMock } = build();
    serve(fetchMock, answer(['Rent led.'], stopReason));
    const events = await collect(service);
    expect(events.at(-1)).toEqual({ type: 'end', outcome: 'incomplete', reason });
  });

  it('ends incomplete / provider_error when the provider errors after text', async () => {
    const { service, fetchMock } = build();
    serve(
      fetchMock,
      provider((p) => {
        p.text('Rent led.');
        p.send('error', { type: 'error', error: { type: 'overloaded_error', message: 'busy' } });
        p.close();
      }),
    );
    await expect(collect(service)).resolves.toEqual([
      { type: 'delta', text: 'Rent led.' },
      { type: 'end', outcome: 'incomplete', reason: 'provider_error' },
    ]);
  });

  it('does not count whitespace-only deltas as the first text', async () => {
    const { service, fetchMock } = build();
    serve(fetchMock, answer(['  ', '\n', 'Rent', ' ', 'led'], 'end_turn'));
    await expect(collect(service)).resolves.toEqual([
      { type: 'delta', text: '  \nRent' },
      { type: 'delta', text: ' ' },
      { type: 'delta', text: 'led' },
      { type: 'end', outcome: 'complete' },
    ]);
  });

  it.each([
    ['no text at all', []],
    ['whitespace only', ['  ', '\n']],
  ])('throws AI_PROVIDER_ERROR for an answer with %s', async (_name, pieces) => {
    const { service, fetchMock } = build();
    serve(fetchMock, answer(pieces, 'end_turn'));
    await expect(collect(service)).rejects.toBeInstanceOf(AiProviderError);
  });

  it('maps 429 to AI_RATE_LIMITED and 500 to AI_PROVIDER_ERROR, each with one call', async () => {
    const { service, fetchMock } = build();
    fetchMock.mockResolvedValueOnce(
      json(429, { type: 'error', error: { type: 'rate_limit_error' } }),
    );
    await expect(collect(service)).rejects.toBeInstanceOf(AiRateLimitedError);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    fetchMock.mockResolvedValueOnce(json(500, { type: 'error', error: { type: 'api_error' } }));
    await expect(collect(service)).rejects.toBeInstanceOf(AiProviderError);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('maps a network failure before text to AI_PROVIDER_ERROR', async () => {
    const { service, fetchMock } = build();
    fetchMock.mockRejectedValueOnce(new TypeError('fetch failed'));
    await expect(collect(service)).rejects.toBeInstanceOf(AiProviderError);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('throws AI_TIMEOUT naming LLM_TIMEOUT_MS when no text arrives in time', async () => {
    vi.stubEnv('LLM_TIMEOUT_MS', '50');
    const { service, fetchMock } = build();
    serve(fetchMock, provider());
    const error = await collect(service).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(AiTimeoutError);
    expect((error as Error).message).toContain('50 ms');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('ends incomplete / timeout when the provider goes silent after text', async () => {
    vi.stubEnv('LLM_TIMEOUT_MS', '50');
    const { service, fetchMock } = build();
    serve(
      fetchMock,
      provider((p) => p.text('Rent led.')),
    );
    await expect(collect(service)).resolves.toEqual([
      { type: 'delta', text: 'Rent led.' },
      { type: 'end', outcome: 'incomplete', reason: 'timeout' },
    ]);
  });

  it('yields nothing more and aborts the provider request after an external abort', async () => {
    const { service, fetchMock } = build();
    serve(
      fetchMock,
      provider((p) => p.text('Rent led.')),
    );
    const outside = new AbortController();
    const events: NarrativeEvent[] = [];
    for await (const event of service.similarNarrative(
      '2026-09-01',
      '2026-09-30',
      outside.signal,
    )) {
      events.push(event);
      outside.abort();
    }
    expect(events).toEqual([{ type: 'delta', text: 'Rent led.' }]);
    expect(fetchMock.mock.calls[0][1]?.signal?.aborted).toBe(true);
  });

  it('returns silently when aborted before any text', async () => {
    const { service, fetchMock } = build();
    serve(fetchMock, provider());
    const outside = new AbortController();
    const pending = collect(service, outside.signal);
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    outside.abort();
    await expect(pending).resolves.toEqual([]);
  });
});

describe('AiService.isConfigured', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it('is true when the key is set, false when it is empty or absent, and never calls out', () => {
    const { service, fetchMock } = build();
    vi.stubEnv('LLM_API_KEY', 'test-key');
    expect(service.isConfigured()).toBe(true);
    vi.stubEnv('LLM_API_KEY', '');
    expect(service.isConfigured()).toBe(false);
    vi.stubEnv('LLM_API_KEY', undefined);
    expect(service.isConfigured()).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
