import { ConsoleLogger, INestApplication } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { createServer, IncomingHttpHeaders, Server, ServerResponse } from 'node:http';
import { randomInt } from 'node:crypto';
import { AddressInfo } from 'node:net';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it, MockInstance, vi } from 'vitest';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/main';
import { expectError, expectValid } from './contract-validation';

type Mode =
  | 'ok'
  | 'gated'
  | 'slow'
  | 'mid-error'
  | 'mid-hang'
  | 'length'
  | 'refusal-after-text'
  | 'empty'
  | 'whitespace'
  | 'error'
  | 'rate-limited'
  | 'hang';

type Received = {
  url?: string;
  headers: IncomingHttpHeaders;
  body: string;
  writes: number[];
  finishedAt?: number;
  closedAt?: number;
  closedEarly?: boolean;
};

type Event = { event: string; data: unknown; at: number };

const range = { from: '1900-01-01', to: '1900-01-31' };
const PIECES = ['Nothing ', 'was ', 'spent.'];

function providerEvent(res: ServerResponse, event: string, data: object): void {
  res.write(`event: ${event}\ndata: ${JSON.stringify({ type: event, ...data })}\n\n`);
}

describe('AI narrative over the similar report, streamed (FR-012)', () => {
  let app: INestApplication;
  let http: ReturnType<INestApplication['getHttpServer']>;
  let base: string;
  let stub: Server;
  let mode: Mode = 'ok';
  let received: Received[] = [];
  let release: () => void = () => undefined;
  let log: MockInstance<ConsoleLogger['log']>;

  function narrative() {
    return request(http).post('/reports/similar/narrative').send(range);
  }

  function expectCorrelated(res: request.Response): void {
    expect(res.body.correlationId).toBe(res.headers['x-correlation-id']);
  }

  async function* events(res: Response): AsyncGenerator<Event> {
    let buffer = '';
    for await (const chunk of res.body!.pipeThrough(new TextDecoderStream())) {
      buffer += chunk;
      let end = buffer.indexOf('\n\n');
      while (end !== -1) {
        const block = buffer.slice(0, end);
        buffer = buffer.slice(end + 2);
        const field = (name: string) =>
          block
            .split('\n')
            .find((line) => line.startsWith(`${name}: `))
            ?.slice(name.length + 2);
        const event = field('event') ?? 'message';
        const data = JSON.parse(field('data') ?? 'null');
        expectValid(event === 'delta' ? 'NarrativeDeltaEvent' : 'NarrativeEndEvent', data);
        yield { event, data, at: Date.now() };
        end = buffer.indexOf('\n\n');
      }
    }
  }

  function stream(signal?: AbortSignal): Promise<Response> {
    return fetch(`${base}/reports/similar/narrative`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(range),
      signal,
    });
  }

  async function readAll(): Promise<{ res: Response; all: Event[] }> {
    const res = await stream();
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/event-stream');
    const all: Event[] = [];
    for await (const event of events(res)) all.push(event);
    return { res, all };
  }

  function text(all: Event[]): string {
    return all
      .filter((event) => event.event === 'delta')
      .map((event) => (event.data as { text: string }).text)
      .join('');
  }

  function outcomeLogs(): Record<string, unknown>[] {
    return log.mock.calls
      .map((call) => call[0] as Record<string, unknown>)
      .filter((entry) => typeof entry === 'object' && entry !== null && 'outcome' in entry);
  }

  beforeAll(async () => {
    stub = createServer((req, res) => {
      let body = '';
      req.on('data', (chunk) => (body += chunk));
      const reply = async () => {
        const entry: Received = { url: req.url, headers: req.headers, body, writes: [] };
        received.push(entry);
        res.on('close', () => {
          entry.closedAt = Date.now();
          entry.closedEarly = !res.writableEnded;
        });
        if (mode === 'hang') return;
        if (mode === 'error' || mode === 'rate-limited') {
          res.statusCode = mode === 'error' ? 500 : 429;
          res.setHeader('content-type', 'application/json');
          const type = mode === 'error' ? 'api_error' : 'rate_limit_error';
          res.end(JSON.stringify({ type: 'error', error: { type, message: type } }));
          return;
        }
        res.writeHead(200, { 'content-type': 'text/event-stream' });
        providerEvent(res, 'message_start', {
          message: {
            id: 'msg_1',
            type: 'message',
            role: 'assistant',
            model: 'claude-haiku-4-5-20251001',
            content: [],
            stop_reason: null,
            stop_sequence: null,
            usage: { input_tokens: 1, output_tokens: 0 },
          },
        });
        providerEvent(res, 'content_block_start', {
          index: 0,
          content_block: { type: 'text', text: '' },
        });
        const piece = (text: string) => {
          providerEvent(res, 'content_block_delta', {
            index: 0,
            delta: { type: 'text_delta', text },
          });
          entry.writes.push(Date.now());
        };
        const finish = (stopReason: string) => {
          providerEvent(res, 'content_block_stop', { index: 0 });
          providerEvent(res, 'message_delta', {
            delta: { stop_reason: stopReason, stop_sequence: null },
            usage: { output_tokens: 1 },
          });
          providerEvent(res, 'message_stop', {});
          entry.finishedAt = Date.now();
          res.end();
        };
        const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
        switch (mode) {
          case 'ok':
            PIECES.forEach(piece);
            return finish('end_turn');
          case 'gated': {
            piece(PIECES[0]);
            await new Promise<void>((resolve) => (release = resolve));
            piece(PIECES[1]);
            piece(PIECES[2]);
            return finish('end_turn');
          }
          case 'slow':
            for (const text of PIECES) {
              if (res.destroyed) return;
              piece(text);
              await pause(200);
            }
            if (!res.destroyed) finish('end_turn');
            return;
          case 'mid-error':
            piece(PIECES[0]);
            res.end(
              `event: error\ndata: ${JSON.stringify({ type: 'error', error: { type: 'overloaded_error', message: 'Overloaded' } })}\n\n`,
            );
            return;
          case 'mid-hang':
            return piece(PIECES[0]);
          case 'length':
            piece(PIECES[0]);
            piece(PIECES[1]);
            return finish('max_tokens');
          case 'refusal-after-text':
            piece(PIECES[0]);
            return finish('refusal');
          case 'empty':
            return finish('end_turn');
          case 'whitespace':
            piece('  ');
            return finish('end_turn');
        }
      };
      req.on('end', () => void reply());
    });
    await new Promise<void>((resolve) => stub.listen(0, '127.0.0.1', resolve));
    const { port } = stub.address() as AddressInfo;
    vi.stubEnv('LLM_BASE_URL', `http://127.0.0.1:${port}`);
    vi.stubEnv('LLM_TIMEOUT_MS', '300');
    log = vi.spyOn(ConsoleLogger.prototype, 'log').mockImplementation(() => undefined);

    app = await NestFactory.create(AppModule, { logger: false });
    configureApp(app);
    await app.listen(0, '127.0.0.1');
    http = app.getHttpServer();
    base = `http://127.0.0.1:${(http.address() as AddressInfo).port}`;
  });

  beforeEach(() => {
    vi.stubEnv('LLM_API_KEY', 'stub-key');
    mode = 'ok';
    received = [];
    log.mockClear();
  });

  afterAll(async () => {
    await app.close();
    stub.closeAllConnections();
    await new Promise<void>((resolve) => stub.close(() => resolve()));
    log.mockRestore();
    vi.unstubAllEnvs();
  });

  it('streams the provider text in order and ends complete, from one call to /v1/messages', async () => {
    const { all } = await readAll();
    expect(text(all)).toBe(PIECES.join(''));
    expect(all.at(-1)).toMatchObject({ event: 'end', data: { outcome: 'complete' } });
    expect(all.filter((event) => event.event === 'end')).toHaveLength(1);
    expect(received).toHaveLength(1);
    expect(received[0].url).toBe('/v1/messages');
    expect(received[0].headers['x-api-key']).toBe('stub-key');
    expect(received[0].headers['anthropic-version']).toBe('2023-06-01');
    expect(JSON.parse(received[0].body).model).toBe('claude-haiku-4-5-20251001');
  });

  it('forwards the first delta before the provider sends the second', async () => {
    mode = 'gated';
    const res = await stream();
    const reader = events(res);
    const first = await reader.next();
    expect(first.value).toMatchObject({ event: 'delta', data: { text: PIECES[0] } });
    expect(received[0].writes).toHaveLength(1);
    release();
    const rest: Event[] = [];
    for await (const event of reader) rest.push(event);
    expect(text(rest)).toBe(PIECES.slice(1).join(''));
    expect(rest.at(-1)).toMatchObject({ event: 'end', data: { outcome: 'complete' } });
    expect(received).toHaveLength(1);
  });

  it('forwards each delta within 500 ms of the provider writing it, and end within 500 ms of its finish (SC-001, SC-005)', async () => {
    mode = 'slow';
    const { all } = await readAll();
    const deltas = all.filter((event) => event.event === 'delta');
    expect(deltas).toHaveLength(PIECES.length);
    deltas.forEach((event, index) =>
      expect(event.at - received[0].writes[index]).toBeLessThan(500),
    );
    expect(all.at(-1)!.at - received[0].finishedAt!).toBeLessThan(500);
    expect(received).toHaveLength(1);
  });

  it.each([
    ['mid-error', 'provider_error', PIECES[0], 0],
    ['refusal-after-text', 'provider_error', PIECES[0], 0],
    ['mid-hang', 'timeout', PIECES[0], 300],
    ['length', 'length', PIECES[0] + PIECES[1], 0],
  ] as const)(
    'keeps the text and ends incomplete when %s',
    async (name, reason, expected, minMs) => {
      mode = name;
      const started = Date.now();
      const { all } = await readAll();
      expect(text(all)).toBe(expected);
      expect(all.at(-1)).toMatchObject({ event: 'end', data: { outcome: 'incomplete', reason } });
      expect(Date.now() - started).toBeGreaterThanOrEqual(minMs);
      expect(received).toHaveLength(1);
    },
  );

  it.each(['empty', 'whitespace'] as const)(
    'answers 502 AI_PROVIDER_ERROR JSON for an answer that is %s',
    async (name) => {
      mode = name;
      const res = await narrative().expect(502);
      expectError(res.body, 'AI_PROVIDER_ERROR');
      expectCorrelated(res);
      expect(received).toHaveLength(1);
    },
  );

  it('answers 422 AI_NOT_CONFIGURED with an empty key, and no request reaches the stub', async () => {
    vi.stubEnv('LLM_API_KEY', '');
    const res = await narrative().expect(422);
    expectError(res.body, 'AI_NOT_CONFIGURED');
    expectCorrelated(res);
    expect(received).toHaveLength(0);
  });

  it('answers 502 AI_PROVIDER_ERROR when the provider fails, without retrying', async () => {
    mode = 'error';
    const res = await narrative().expect(502);
    expectError(res.body, 'AI_PROVIDER_ERROR');
    expectCorrelated(res);
    expect(received).toHaveLength(1);
  });

  it('answers 503 AI_RATE_LIMITED on a provider 429, without retrying', async () => {
    mode = 'rate-limited';
    const res = await narrative().expect(503);
    expectError(res.body, 'AI_RATE_LIMITED');
    expectCorrelated(res);
    expect(received).toHaveLength(1);
  });

  it('answers 504 AI_TIMEOUT once LLM_TIMEOUT_MS passes without text, without retrying', async () => {
    mode = 'hang';
    const res = await narrative().expect(504);
    expectError(res.body, 'AI_TIMEOUT');
    expect(res.body.message).toContain('300 ms');
    expectCorrelated(res);
    expect(received).toHaveLength(1);
  });

  it('ends the provider request within 1 s when the client aborts after the first delta', async () => {
    mode = 'slow';
    const client = new AbortController();
    const res = await stream(client.signal);
    const first = await events(res).next();
    expect(first.value).toMatchObject({ event: 'delta' });
    const abortedAt = Date.now();
    client.abort();
    await vi.waitFor(() => expect(received[0].closedAt).toBeDefined(), { timeout: 1000 });
    expect(received[0].closedAt! - abortedAt).toBeLessThan(1000);
    expect(received[0].closedEarly).toBe(true);
    expect(received).toHaveLength(1);
  });

  it('logs one outcome line for a complete, an incomplete and a client-closed stream (FR-014a)', async () => {
    const complete = await readAll();
    await vi.waitFor(() => expect(outcomeLogs()).toHaveLength(1));
    expect(outcomeLogs()[0]).toEqual({
      correlationId: complete.res.headers.get('x-correlation-id'),
      outcome: 'complete',
    });

    log.mockClear();
    mode = 'length';
    const incomplete = await readAll();
    await vi.waitFor(() => expect(outcomeLogs()).toHaveLength(1));
    expect(outcomeLogs()[0]).toEqual({
      correlationId: incomplete.res.headers.get('x-correlation-id'),
      outcome: 'incomplete',
      reason: 'length',
    });

    log.mockClear();
    mode = 'slow';
    const client = new AbortController();
    const res = await stream(client.signal);
    await events(res).next();
    client.abort();
    await vi.waitFor(() => expect(outcomeLogs()).toHaveLength(1));
    expect(outcomeLogs()[0]).toEqual({
      correlationId: res.headers.get('x-correlation-id'),
      outcome: 'client_closed',
    });
  });

  it('sends descriptions stripped of Markdown, HTML and line breaks, with max_tokens 512 (FR-008a)', async () => {
    const month = `${randomInt(1901, 2000)}-${String(randomInt(1, 13)).padStart(2, '0')}`;
    const account = await request(http)
      .post('/accounts')
      .send({
        name: `AI marks ${Date.now()}`,
        kind: 'bank',
        openingBalance: '100000',
        openingDate: `${month}-01`,
      })
      .expect(201);
    const categories = await request(http).get('/categories').expect(200);
    const categoryId = categories.body.find(
      (category: { type: string }) => category.type === 'expense',
    ).id;
    await request(http)
      .post('/transactions')
      .send({
        kind: 'expense',
        date: `${month}-02`,
        description: '**Rent** <b>May</b> [x](y)\nnote',
        amount: '4250',
        accountId: account.body.id,
        categoryId,
      })
      .expect(201);

    const res = await fetch(`${base}/reports/similar/narrative`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ from: `${month}-01`, to: `${month}-28` }),
    });
    await res.text();
    expect(res.status).toBe(200);
    const sent = JSON.parse(received[0].body);
    expect(sent.max_tokens).toBe(512);
    const descriptions = JSON.parse(sent.messages[0].content).groups.map(
      (group: { description: string }) => group.description,
    );
    expect(descriptions).toContain('rent bmay/b xy note');
    for (const description of descriptions) expect(description).not.toMatch(/[*_`#<>[\]()!|~\n]/);
  });

  it('leaves the deterministic report untouched while the provider fails mid-stream', async () => {
    mode = 'mid-error';
    await readAll();
    const res = await request(http).get('/reports/similar').query(range).expect(200);
    expectValid('SimilarReportResponse', res.body);
    expect(res.body.groups).toEqual([]);
  });

  it('rejects a malformed body before any provider call', async () => {
    const res = await request(http)
      .post('/reports/similar/narrative')
      .send({ from: 'soon' })
      .expect(400);
    expectError(res.body, 'VALIDATION_FAILED');
    expect(received).toHaveLength(0);
  });

  it('reports configured from the key alone, without calling the provider', async () => {
    const set = await request(http).get('/ai/status').expect(200);
    expectValid('AiStatusResponse', set.body);
    expect(set.body).toEqual({ configured: true });

    vi.stubEnv('LLM_API_KEY', '');
    const empty = await request(http).get('/ai/status').expect(200);
    expectValid('AiStatusResponse', empty.body);
    expect(empty.body).toEqual({ configured: false });
    expect(received).toHaveLength(0);
  });
});
