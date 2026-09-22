import { INestApplication } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import request from 'supertest';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/main';

async function buildApp(): Promise<INestApplication> {
  const app = await NestFactory.create(AppModule, { logger: false });
  configureApp(app);
  await app.init();
  return app;
}

describe('security headers and CORS contract (R-004, R-005, R-006)', () => {
  let app: INestApplication;
  const originalNodeEnv = process.env.NODE_ENV;

  beforeAll(async () => {
    app = await buildApp();
  });

  afterAll(async () => {
    await app.close();
  });

  afterEach(() => {
    process.env.NODE_ENV = originalNodeEnv;
  });

  it('serves the API CSP and helmet headers on every response', async () => {
    const res = await request(app.getHttpServer()).get('/');
    expect(res.headers['content-security-policy']).toBe(
      "default-src 'none';frame-ancestors 'none'",
    );
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['x-powered-by']).toBeUndefined();
  });

  it('omits HSTS outside production and emits it under NODE_ENV=production', async () => {
    const res = await request(app.getHttpServer()).get('/');
    expect(res.headers['strict-transport-security']).toBeUndefined();

    process.env.NODE_ENV = 'production';
    const prodApp = await buildApp();
    const prodRes = await request(prodApp.getHttpServer()).get('/');
    expect(prodRes.headers['strict-transport-security']).toBeDefined();
    await prodApp.close();
  });

  it('echoes an allowed origin and exposes the correlation id header', async () => {
    const res = await request(app.getHttpServer()).get('/').set('Origin', 'http://localhost:5173');
    expect(res.headers['access-control-allow-origin']).toBe('http://localhost:5173');
    expect(res.headers['access-control-expose-headers']).toBe('X-Correlation-Id');
  });

  it('gives a foreign origin no CORS headers', async () => {
    const res = await request(app.getHttpServer()).get('/').set('Origin', 'http://evil.example');
    expect(res.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('answers preflight OPTIONS with the allowed methods', async () => {
    const res = await request(app.getHttpServer())
      .options('/')
      .set('Origin', 'http://localhost:8080')
      .set('Access-Control-Request-Method', 'POST');
    expect(res.status).toBe(204);
    expect(res.headers['access-control-allow-origin']).toBe('http://localhost:8080');
    expect(res.headers['access-control-allow-methods']).toBe('GET,POST,PUT,PATCH,DELETE');
    expect(res.headers['access-control-max-age']).toBe('3600');
  });

  it('answers unknown routes with the frozen ErrorResponse shape and a fresh correlation id', async () => {
    const res = await request(app.getHttpServer())
      .get('/nowhere')
      .set('X-Correlation-Id', 'inbound-ignored');
    expect(res.status).toBe(404);
    expect(res.headers['x-correlation-id']).toMatch(/^[0-9a-f-]{36}$/);
    expect(res.headers['x-correlation-id']).not.toBe('inbound-ignored');
    expect(res.body).toEqual({
      code: 'NOT_FOUND',
      message: expect.stringContaining('/nowhere'),
      correlationId: res.headers['x-correlation-id'],
    });
  });
});
