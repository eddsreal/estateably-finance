import { INestApplication } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/main';
import { expectError, expectValid } from './contract-validation';

const run = promisify(execFile);
const suffix = Date.now();

describe('balances (US2)', () => {
  let app: INestApplication;
  let http: ReturnType<INestApplication['getHttpServer']>;
  let prisma: PrismaClient;
  let accountId: string;
  let groceriesId: string;
  let salaryId: string;

  async function balanceAsOf(asOf: string): Promise<string> {
    const res = await request(http)
      .get(`/accounts/${accountId}/balance`)
      .query({ asOf })
      .expect(200);
    expectValid('BalanceResponse', res.body);
    expect(res.body.accountId).toBe(accountId);
    expect(res.body.asOf).toBe(asOf);
    return res.body.balance;
  }

  async function currentBalance(): Promise<string> {
    const res = await request(http).get('/accounts').expect(200);
    expectValid('AccountListResponse', res.body);
    return res.body.items.find((item: { id: string }) => item.id === accountId).balance;
  }

  beforeAll(async () => {
    prisma = new PrismaClient({ adapter: new PrismaPg(process.env.DATABASE_URL ?? '') });
    app = await NestFactory.create(AppModule, { logger: false });
    configureApp(app);
    await app.init();
    http = app.getHttpServer();

    const account = await request(http)
      .post('/accounts')
      .send({
        name: `US2 Checking ${suffix}`,
        kind: 'bank',
        openingBalance: '150000',
        openingDate: '2026-09-01',
      })
      .expect(201);
    accountId = account.body.id;

    const categories = await request(http).get('/categories').expect(200);
    const byName = (name: string) =>
      categories.body.find((category: { name: string }) => category.name === name);
    groceriesId = byName('Groceries').id;
    salaryId = byName('Salary').id;

    await request(http)
      .post('/transactions')
      .send({
        kind: 'expense',
        date: '2026-09-10',
        description: 'Market',
        amount: '4250',
        accountId,
        categoryId: groceriesId,
      })
      .expect(201);
    await request(http)
      .post('/transactions')
      .send({
        kind: 'income',
        date: '2026-09-15',
        description: 'September salary',
        amount: '300000',
        accountId,
        categoryId: salaryId,
      })
      .expect(201);
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  it('shows $4,457.50 as the current balance and counts it in the non-archived total (US2 #1, #7)', async () => {
    const res = await request(http).get('/accounts').expect(200);
    expectValid('AccountListResponse', res.body);
    const items = res.body.items as { id: string; balance: string }[];
    expect(items.find((item) => item.id === accountId)?.balance).toBe('445750');
    const summed = items.reduce((sum, item) => sum + BigInt(item.balance), 0n);
    expect(BigInt(res.body.totalBalance)).toBe(summed);
  });

  it('answers $1,457.50 between transactions and on a transaction date, inclusive (US2 #2, #3)', async () => {
    expect(await balanceAsOf('2026-09-12')).toBe('145750');
    expect(await balanceAsOf('2026-09-10')).toBe('145750');
  });

  it('answers "0" for a date before the first transaction (US2 #4)', async () => {
    expect(await balanceAsOf('2026-08-15')).toBe('0');
  });

  it('computes the same value with the snapshot present, absent and corrupted, and repairs via ledger:rebuild (US2 #5, SC-003)', async () => {
    expect(await balanceAsOf('2026-09-15')).toBe('445750');

    await prisma.balanceSnapshot.delete({ where: { accountId: BigInt(accountId) } });
    expect(await balanceAsOf('2026-09-15')).toBe('445750');

    await prisma.balanceSnapshot.create({
      data: { accountId: BigInt(accountId), balance: 999n },
    });
    expect(await balanceAsOf('2026-09-15')).toBe('445750');

    await run('node', ['src/modules/ledger/reconciliation.ts', 'rebuild']);
    expect(await balanceAsOf('2026-09-15')).toBe('445750');
    expect(await currentBalance()).toBe('445750');
  });

  it('reflects a create, edit and delete on the very next read (US2 #6, FR-028)', async () => {
    const created = await request(http)
      .post('/transactions')
      .send({
        kind: 'expense',
        date: '2026-09-16',
        description: 'Bakery',
        amount: '1000',
        accountId,
        categoryId: groceriesId,
      })
      .expect(201);
    expect(await currentBalance()).toBe('444750');
    expect(await balanceAsOf('2026-09-16')).toBe('444750');
    expect(await balanceAsOf('2026-09-12')).toBe('145750');

    await request(http)
      .put(`/transactions/${created.body.id}`)
      .send({
        kind: 'expense',
        date: '2026-09-16',
        description: 'Bakery',
        amount: '2000',
        accountId,
        categoryId: groceriesId,
      })
      .expect(200);
    expect(await currentBalance()).toBe('443750');
    expect(await balanceAsOf('2026-09-16')).toBe('443750');

    await request(http).delete(`/transactions/${created.body.id}`).expect(204);
    expect(await currentBalance()).toBe('445750');
    expect(await balanceAsOf('2026-09-16')).toBe('445750');
  });

  it('rejects a malformed or impossible asOf date and 404s a missing account', async () => {
    const missing = await request(http).get(`/accounts/${accountId}/balance`).query({}).expect(400);
    expect(missing.body.code).toBe('VALIDATION_FAILED');
    expectError(missing.body, 'VALIDATION_FAILED');

    const malformed = await request(http)
      .get(`/accounts/${accountId}/balance`)
      .query({ asOf: 'not-a-date' })
      .expect(400);
    expectError(malformed.body, 'VALIDATION_FAILED');

    const impossible = await request(http)
      .get(`/accounts/${accountId}/balance`)
      .query({ asOf: '2026-13-40' })
      .expect(400);
    expectError(impossible.body, 'VALIDATION_FAILED');

    const notFound = await request(http)
      .get('/accounts/999999999/balance')
      .query({ asOf: '2026-09-12' })
      .expect(404);
    expectError(notFound.body, 'NOT_FOUND');
  });
});
