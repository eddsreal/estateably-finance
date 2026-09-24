import { INestApplication } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module';
import { addDays, addMonthsClamped, appToday, toDateOnly } from '../src/common/dates/dates';
import { configureApp } from '../src/main';
import { expectError, expectValid } from './contract-validation';

const run = Date.now();

type History = {
  from: string;
  to: string;
  total: string[];
  accounts: { accountId: string; archived: boolean; balances: string[] }[];
};

describe('balance history (FR-006, FR-007, SC-005)', () => {
  let app: INestApplication;
  let http: ReturnType<INestApplication['getHttpServer']>;
  let prisma: PrismaClient;
  let liveId: string;
  let archivedId: string;

  async function history(query: Record<string, string> = {}): Promise<History> {
    const res = await request(http).get('/accounts/balance-history').query(query).expect(200);
    expectValid('BalanceHistoryResponse', res.body);
    return res.body;
  }

  async function listIds(includeArchived: boolean): Promise<string[]> {
    const res = await request(http)
      .get('/accounts')
      .query({ includeArchived: String(includeArchived) })
      .expect(200);
    return res.body.items.map((item: { id: string }) => item.id);
  }

  function activeSum(body: History, i: number): bigint {
    return body.accounts
      .filter((account) => !account.archived)
      .reduce((sum, account) => sum + BigInt(account.balances[i]), 0n);
  }

  async function createAccount(name: string, openingBalance: string): Promise<string> {
    const res = await request(http)
      .post('/accounts')
      .send({ name: `${name} ${run}`, kind: 'bank', openingBalance, openingDate: '2026-09-01' })
      .expect(201);
    return res.body.id;
  }

  beforeAll(async () => {
    prisma = new PrismaClient({ adapter: new PrismaPg(process.env.DATABASE_URL ?? '') });
    app = await NestFactory.create(AppModule, { logger: false });
    configureApp(app);
    await app.init();
    http = app.getHttpServer();

    const categories = await request(http).get('/categories').expect(200);
    const groceriesId = categories.body.find(
      (category: { name: string }) => category.name === 'Groceries',
    ).id;
    liveId = await createAccount('History live', '150000');
    await request(http)
      .post('/transactions')
      .send({
        kind: 'expense',
        date: '2026-09-10',
        description: 'History groceries',
        amount: '4250',
        accountId: liveId,
        categoryId: groceriesId,
      })
      .expect(201);
    archivedId = await createAccount('History archived', '777700');
    await request(http).post(`/accounts/${archivedId}/archive`).expect(200);
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  it('answers one exact balance per day for an account, from its entries', async () => {
    const body = await history({ from: '2026-08-30', to: '2026-09-11' });
    expect(body.from).toBe('2026-08-30');
    expect(body.to).toBe('2026-09-11');
    expect(body.total).toHaveLength(13);
    const live = body.accounts.find((account) => account.accountId === liveId);
    expect(live?.balances).toEqual(['0', '0', ...Array(9).fill('150000'), '145750', '145750']);
  });

  it('sums total over active accounts only, and includeArchived leaves it unchanged', async () => {
    const without = await history({ from: '2026-08-30', to: '2026-09-11' });
    const withArchived = await history({
      from: '2026-08-30',
      to: '2026-09-11',
      includeArchived: 'true',
    });
    expect(without.accounts.some((account) => account.archived)).toBe(false);
    const archived = withArchived.accounts.find((account) => account.accountId === archivedId);
    expect(archived?.archived).toBe(true);
    expect(archived?.balances.at(-1)).toBe('777700');
    expect(withArchived.total).toEqual(without.total);
    withArchived.total.forEach((value, i) =>
      expect(BigInt(value)).toBe(activeSum(withArchived, i)),
    );
  });

  it('lists the same accounts in the same order as listAccounts', async () => {
    for (const includeArchived of [false, true]) {
      const body = await history({ includeArchived: String(includeArchived) });
      expect(body.accounts.map((account) => account.accountId)).toEqual(
        await listIds(includeArchived),
      );
    }
  });

  it('defaults to to today and from to the earliest entry of active accounts', async () => {
    const today = appToday();
    const body = await history();
    const withArchived = await history({ includeArchived: 'true' });
    const earliest = await prisma.entry.findFirst({
      where: { account: { archived: false }, transaction: { deletedAt: null } },
      orderBy: { transaction: { date: 'asc' } },
      select: { transaction: { select: { date: true } } },
    });
    const floor = addMonthsClamped(today, -120);
    const first = earliest ? toDateOnly(earliest.transaction.date) : today;
    expect(body.to).toBe(today);
    expect(body.from).toBe(first < floor ? floor : first);
    expect(withArchived.from).toBe(body.from);
    expect(addDays(body.from, body.total.length - 1)).toBe(today);
  });

  it("ends on listAccounts' totalBalance when to is today", async () => {
    const body = await history();
    const accounts = await request(http).get('/accounts').expect(200);
    expect(body.total.at(-1)).toBe(accounts.body.totalBalance);
  });

  it('equals the as-of balance of every account on sampled days', async () => {
    const body = await history({ from: '2026-08-15', to: '2026-09-20', includeArchived: 'true' });
    for (const i of [0, 17, body.total.length - 1]) {
      const asOf = addDays(body.from, i);
      for (const account of body.accounts) {
        const res = await request(http)
          .get(`/accounts/${account.accountId}/balance`)
          .query({ asOf })
          .expect(200);
        expect({ accountId: account.accountId, asOf, balance: account.balances[i] }).toEqual({
          accountId: account.accountId,
          asOf,
          balance: res.body.balance,
        });
      }
    }
  });

  it('rejects to after today, from after to and a span over 10 years', async () => {
    const today = appToday();
    const cases: Record<string, string>[] = [
      { to: addDays(today, 1) },
      { from: '2026-09-11', to: '2026-09-10' },
      { from: addDays(addMonthsClamped('2026-09-10', -120), -1), to: '2026-09-10' },
      { includeArchived: 'maybe' },
      { from: '2026-02-30' },
    ];
    for (const query of cases) {
      const res = await request(http).get('/accounts/balance-history').query(query);
      expect({ query, status: res.status }).toEqual({ query, status: 400 });
      expectError(res.body, 'VALIDATION_FAILED');
    }
    await history({ from: addMonthsClamped('2026-09-10', -120), to: '2026-09-10' });
  });
});
