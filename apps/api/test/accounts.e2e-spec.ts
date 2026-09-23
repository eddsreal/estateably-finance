import { INestApplication } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/main';
import { expectError, expectValid } from './contract-validation';

const run = Date.now();
const name = (base: string) => `${base} ${run}`;

describe('accounts (US1)', () => {
  let app: INestApplication;
  let http: ReturnType<INestApplication['getHttpServer']>;

  beforeAll(async () => {
    app = await NestFactory.create(AppModule, { logger: false });
    configureApp(app);
    await app.init();
    http = app.getHttpServer();
  });

  afterAll(async () => {
    await app.close();
  });

  async function totalBalance(): Promise<bigint> {
    const res = await request(http).get('/accounts').expect(200);
    expectValid('AccountListResponse', res.body);
    return BigInt(res.body.totalBalance);
  }

  it('creates an account whose opening balance becomes an opening transaction', async () => {
    const res = await request(http)
      .post('/accounts')
      .send({
        name: name('Checking E2E'),
        kind: 'bank',
        openingBalance: '150000',
        openingDate: '2026-09-01',
      })
      .expect(201);
    expectValid('AccountResponse', res.body);
    expect(res.body.balance).toBe('150000');
    expect(res.body.openingBalance).toBe('150000');

    const list = await request(http)
      .get('/transactions')
      .query({ accountId: res.body.id, kind: 'opening' })
      .expect(200);
    expectValid('PaginatedTransactions', list.body);
    expect(list.body.total).toBe(1);
    expect(list.body.items[0].amount).toBe('150000');
  });

  it('creates a card with a negative opening balance and counts the debt in the total (US1 #11)', async () => {
    const before = await totalBalance();
    const res = await request(http)
      .post('/accounts')
      .send({
        name: name('Visa E2E'),
        kind: 'card',
        openingBalance: '-50000',
        openingDate: '2026-09-01',
      })
      .expect(201);
    expectValid('AccountResponse', res.body);
    expect(res.body.balance).toBe('-50000');
    expect(await totalBalance()).toBe(before - 50000n);
  });

  it('records nothing for a zero opening balance and creates the opening on a later edit', async () => {
    const created = await request(http)
      .post('/accounts')
      .send({
        name: name('Savings E2E'),
        kind: 'bank',
        openingBalance: '0',
        openingDate: '2026-09-01',
      })
      .expect(201);
    expect(created.body.openingBalance).toBe('0');
    const none = await request(http)
      .get('/transactions')
      .query({ accountId: created.body.id, kind: 'opening' })
      .expect(200);
    expect(none.body.total).toBe(0);

    const patched = await request(http)
      .patch(`/accounts/${created.body.id}`)
      .send({ openingBalance: '30000' })
      .expect(200);
    expectValid('AccountResponse', patched.body);
    expect(patched.body.balance).toBe('30000');
    const one = await request(http)
      .get('/transactions')
      .query({ accountId: created.body.id, kind: 'opening' })
      .expect(200);
    expect(one.body.total).toBe(1);
  });

  it('rebalances the opening on an amount edit and deletes it on a zero edit', async () => {
    const created = await request(http)
      .post('/accounts')
      .send({
        name: name('Rebalance E2E'),
        kind: 'bank',
        openingBalance: '150000',
        openingDate: '2026-09-01',
      })
      .expect(201);

    const raised = await request(http)
      .patch(`/accounts/${created.body.id}`)
      .send({ openingBalance: '175000', openingDate: '2026-09-02' })
      .expect(200);
    expect(raised.body.balance).toBe('175000');
    expect(raised.body.openingDate).toBe('2026-09-02');

    const zeroed = await request(http)
      .patch(`/accounts/${created.body.id}`)
      .send({ openingBalance: '0' })
      .expect(200);
    expect(zeroed.body.balance).toBe('0');
    expect(zeroed.body.openingBalance).toBe('0');
    const none = await request(http)
      .get('/transactions')
      .query({ accountId: created.body.id, kind: 'opening' })
      .expect(200);
    expect(none.body.total).toBe(0);
  });

  it('renames and changes kind without touching the ledger', async () => {
    const created = await request(http)
      .post('/accounts')
      .send({
        name: name('Rename E2E'),
        kind: 'bank',
        openingBalance: '1000',
        openingDate: '2026-09-01',
      })
      .expect(201);
    const res = await request(http)
      .patch(`/accounts/${created.body.id}`)
      .send({ name: name('Renamed E2E'), kind: 'cash' })
      .expect(200);
    expectValid('AccountResponse', res.body);
    expect(res.body.name).toBe(name('Renamed E2E'));
    expect(res.body.kind).toBe('cash');
    expect(res.body.balance).toBe('1000');
  });

  it('archives out of the default list and totals, then unarchives with the same balance (US1 #9)', async () => {
    const created = await request(http)
      .post('/accounts')
      .send({
        name: name('Archive E2E'),
        kind: 'bank',
        openingBalance: '77700',
        openingDate: '2026-09-01',
      })
      .expect(201);
    const before = await totalBalance();

    const archived = await request(http).post(`/accounts/${created.body.id}/archive`).expect(200);
    expectValid('AccountResponse', archived.body);
    expect(archived.body.archived).toBe(true);
    expect(await totalBalance()).toBe(before - 77700n);

    const defaultList = await request(http).get('/accounts').expect(200);
    const ids = defaultList.body.items.map((item: { id: string }) => item.id);
    expect(ids).not.toContain(created.body.id);
    const fullList = await request(http)
      .get('/accounts')
      .query({ includeArchived: 'true' })
      .expect(200);
    const fullIds = fullList.body.items.map((item: { id: string }) => item.id);
    expect(fullIds).toContain(created.body.id);

    const unarchived = await request(http)
      .post(`/accounts/${created.body.id}/unarchive`)
      .expect(200);
    expect(unarchived.body.archived).toBe(false);
    expect(unarchived.body.balance).toBe('77700');
    expect(await totalBalance()).toBe(before);
  });

  it('rejects duplicate names case- and whitespace-insensitively, archived rows included', async () => {
    const base = name('Duplicate E2E');
    await request(http)
      .post('/accounts')
      .send({ name: base, kind: 'bank', openingBalance: '0', openingDate: '2026-09-01' })
      .expect(201);
    const dup = await request(http)
      .post('/accounts')
      .send({
        name: `  ${base.toUpperCase()}  `,
        kind: 'cash',
        openingBalance: '0',
        openingDate: '2026-09-01',
      })
      .expect(409);
    expect(dup.body.code).toBe('DUPLICATE_NAME');
    expectError(dup.body, 'DUPLICATE_NAME');

    const archivedDup = await request(http)
      .post('/accounts')
      .send({ name: 'old bank', kind: 'bank', openingBalance: '0', openingDate: '2026-09-01' })
      .expect(409);
    expectError(archivedDup.body, 'DUPLICATE_NAME');
  });

  it('answers 404 for a missing path id', async () => {
    const res = await request(http)
      .patch('/accounts/999999999')
      .send({ name: name('Ghost') })
      .expect(404);
    expect(res.body.code).toBe('NOT_FOUND');
    expectError(res.body, 'NOT_FOUND');
    const archive = await request(http).post('/accounts/999999999/archive').expect(404);
    expectError(archive.body, 'NOT_FOUND');
  });

  it('rejects bad shapes with field-level details: long name, bad kind, future date, bad money', async () => {
    const longName = await request(http)
      .post('/accounts')
      .send({ name: 'x'.repeat(61), kind: 'bank', openingBalance: '0', openingDate: '2026-09-01' })
      .expect(400);
    expectError(longName.body, 'VALIDATION_FAILED');
    expect(longName.body.details[0].field).toBe('name');

    const badKind = await request(http)
      .post('/accounts')
      .send({
        name: name('Bad kind'),
        kind: 'wallet',
        openingBalance: '0',
        openingDate: '2026-09-01',
      })
      .expect(400);
    expectError(badKind.body, 'VALIDATION_FAILED');

    const future = await request(http)
      .post('/accounts')
      .send({ name: name('Future'), kind: 'bank', openingBalance: '0', openingDate: '2999-01-01' })
      .expect(400);
    expectError(future.body, 'VALIDATION_FAILED');

    const overGuard = await request(http)
      .post('/accounts')
      .send({
        name: name('Guard'),
        kind: 'bank',
        openingBalance: '1000000000000001',
        openingDate: '2026-09-01',
      })
      .expect(400);
    expectError(overGuard.body, 'VALIDATION_FAILED');
    expect(overGuard.body.details[0].field).toBe('openingBalance');

    const numberMoney = await request(http)
      .post('/accounts')
      .send({ name: name('Number'), kind: 'bank', openingBalance: 100, openingDate: '2026-09-01' })
      .expect(400);
    expectError(numberMoney.body, 'VALIDATION_FAILED');
  });
});
