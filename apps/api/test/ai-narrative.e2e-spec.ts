import { INestApplication } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { createServer, IncomingHttpHeaders, Server } from 'node:http';
import { AddressInfo } from 'node:net';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/main';
import { expectError, expectValid } from './contract-validation';

type Mode = 'ok' | 'error' | 'rate-limited' | 'hang';

const range = { from: '1900-01-01', to: '1900-01-31' };

describe('AI narrative over the similar report (US6, FR-015)', () => {
  let app: INestApplication;
  let http: ReturnType<INestApplication['getHttpServer']>;
  let stub: Server;
  let mode: Mode = 'ok';
  let received: { url?: string; headers: IncomingHttpHeaders; body: string }[] = [];

  function narrative() {
    return request(http).post('/reports/similar/narrative').send(range);
  }

  function expectCorrelated(res: request.Response): void {
    expect(res.body.correlationId).toBe(res.headers['x-correlation-id']);
  }

  beforeAll(async () => {
    stub = createServer((req, res) => {
      let body = '';
      req.on('data', (chunk) => (body += chunk));
      req.on('end', () => {
        received.push({ url: req.url, headers: req.headers, body });
        if (mode === 'hang') return;
        res.setHeader('content-type', 'application/json');
        if (mode === 'error') {
          res.statusCode = 500;
          res.end(JSON.stringify({ type: 'error', error: { type: 'api_error' } }));
          return;
        }
        if (mode === 'rate-limited') {
          res.statusCode = 429;
          res.end(JSON.stringify({ type: 'error', error: { type: 'rate_limit_error' } }));
          return;
        }
        res.end(JSON.stringify({ content: [{ type: 'text', text: 'Nothing was spent.' }] }));
      });
    });
    await new Promise<void>((resolve) => stub.listen(0, '127.0.0.1', resolve));
    const { port } = stub.address() as AddressInfo;
    vi.stubEnv('LLM_BASE_URL', `http://127.0.0.1:${port}`);
    vi.stubEnv('LLM_TIMEOUT_MS', '300');

    app = await NestFactory.create(AppModule, { logger: false });
    configureApp(app);
    await app.init();
    http = app.getHttpServer();
  });

  beforeEach(() => {
    vi.stubEnv('LLM_API_KEY', 'stub-key');
    mode = 'ok';
    received = [];
  });

  afterAll(async () => {
    await app.close();
    stub.closeAllConnections();
    await new Promise<void>((resolve) => stub.close(() => resolve()));
    vi.unstubAllEnvs();
  });

  it('returns the provider narrative, sending the key and version headers to /v1/messages', async () => {
    const res = await narrative().expect(200);
    expectValid('NarrativeResponse', res.body);
    expect(res.body).toEqual({ narrative: 'Nothing was spent.' });
    expect(received).toHaveLength(1);
    expect(received[0].url).toBe('/v1/messages');
    expect(received[0].headers['x-api-key']).toBe('stub-key');
    expect(received[0].headers['anthropic-version']).toBe('2023-06-01');
    expect(JSON.parse(received[0].body).model).toBe('claude-haiku-4-5-20251001');
  });

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

  it('answers 504 AI_TIMEOUT once LLM_TIMEOUT_MS elapses, without retrying', async () => {
    mode = 'hang';
    const res = await narrative().expect(504);
    expectError(res.body, 'AI_TIMEOUT');
    expect(res.body.message).toContain('300 ms');
    expectCorrelated(res);
    expect(received).toHaveLength(1);
  });

  it('leaves the deterministic report untouched while the provider is failing', async () => {
    mode = 'error';
    await narrative().expect(502);
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
});
