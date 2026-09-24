import { INestApplication } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/main';
import { expectError, expectValid } from './contract-validation';

const run = Date.now();

describe('transactions (US1)', () => {
  let app: INestApplication;
  let http: ReturnType<INestApplication['getHttpServer']>;
  let prisma: PrismaClient;
  let accountA: string;
  let accountB: string;
  let groceriesId: string;
  let salaryId: string;
  let archivedCategoryId: string;
  let archivedAccountId: string;

  async function createAccount(name: string, openingBalance: string): Promise<string> {
    const res = await request(http)
      .post('/accounts')
      .send({ name: `${name} ${run}`, kind: 'bank', openingBalance, openingDate: '2026-09-01' })
      .expect(201);
    return res.body.id;
  }

  async function balanceOf(id: string): Promise<bigint> {
    const res = await request(http).get('/accounts').query({ includeArchived: 'true' }).expect(200);
    const item = res.body.items.find((candidate: { id: string }) => candidate.id === id);
    return BigInt(item.balance);
  }

  async function totalFor(accountId: string): Promise<number> {
    const res = await request(http).get('/transactions').query({ accountId }).expect(200);
    return res.body.total;
  }

  async function entriesSumOf(transactionId: string): Promise<bigint> {
    const rows = await prisma.entry.findMany({ where: { transactionId: BigInt(transactionId) } });
    expect(rows).toHaveLength(2);
    return rows.reduce((sum, row) => sum + row.amount, 0n);
  }

  beforeAll(async () => {
    prisma = new PrismaClient({ adapter: new PrismaPg(process.env.DATABASE_URL ?? '') });
    app = await NestFactory.create(AppModule, { logger: false });
    configureApp(app);
    await app.init();
    http = app.getHttpServer();

    accountA = await createAccount('Tx A', '150000');
    accountB = await createAccount('Tx B', '0');

    const categories = await request(http)
      .get('/categories')
      .query({ includeArchived: 'true' })
      .expect(200);
    const byName = (name: string) =>
      categories.body.find((category: { name: string }) => category.name === name);
    groceriesId = byName('Groceries').id;
    salaryId = byName('Salary').id;
    archivedCategoryId = byName('Subscriptions').id;

    const accounts = await request(http)
      .get('/accounts')
      .query({ includeArchived: 'true' })
      .expect(200);
    archivedAccountId = accounts.body.items.find(
      (account: { name: string }) => account.name === 'Old Bank',
    ).id;
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  it('records an expense: balance drops, two entries sum to zero (US1 #2)', async () => {
    const res = await request(http)
      .post('/transactions')
      .send({
        kind: 'expense',
        date: '2026-09-10',
        description: 'Market',
        amount: '4250',
        accountId: accountA,
        categoryId: groceriesId,
      })
      .expect(201);
    expectValid('TransactionResponse', res.body);
    expect(res.body.kind).toBe('expense');
    expect(res.body.amount).toBe('4250');
    expect(res.body.categoryId).toBe(groceriesId);
    expect(await balanceOf(accountA)).toBe(150000n - 4250n);
    expect(await entriesSumOf(res.body.id)).toBe(0n);
  });

  it('records an income that raises the balance (US1 #3)', async () => {
    const before = await balanceOf(accountA);
    const res = await request(http)
      .post('/transactions')
      .send({
        kind: 'income',
        date: '2026-09-15',
        description: 'September salary',
        amount: '300000',
        accountId: accountA,
        categoryId: salaryId,
      })
      .expect(201);
    expectValid('TransactionResponse', res.body);
    expect(await balanceOf(accountA)).toBe(before + 300000n);
    expect(await entriesSumOf(res.body.id)).toBe(0n);
  });

  it('records a transfer that moves money between the two accounts, no category (US1 #4)', async () => {
    const beforeA = await balanceOf(accountA);
    const beforeB = await balanceOf(accountB);
    const res = await request(http)
      .post('/transactions')
      .send({
        kind: 'transfer',
        date: '2026-09-16',
        description: 'To savings',
        amount: '50000',
        accountId: accountA,
        counterAccountId: accountB,
      })
      .expect(201);
    expectValid('TransactionResponse', res.body);
    expect(res.body.categoryId).toBeUndefined();
    expect(res.body.counterAccountId).toBe(accountB);
    expect(await balanceOf(accountA)).toBe(beforeA - 50000n);
    expect(await balanceOf(accountB)).toBe(beforeB + 50000n);

    const inA = await request(http)
      .get('/transactions')
      .query({ accountId: accountA, kind: 'transfer' })
      .expect(200);
    const inB = await request(http)
      .get('/transactions')
      .query({ accountId: accountB, kind: 'transfer' })
      .expect(200);
    expect(inA.body.items.map((item: { id: string }) => item.id)).toContain(res.body.id);
    expect(inB.body.items.map((item: { id: string }) => item.id)).toContain(res.body.id);
  });

  it('edits an expense into a transfer, clearing the category (US1 #5a)', async () => {
    const created = await request(http)
      .post('/transactions')
      .send({
        kind: 'expense',
        date: '2026-09-17',
        description: 'Actually a transfer',
        amount: '5000',
        accountId: accountA,
        categoryId: groceriesId,
      })
      .expect(201);
    const beforeB = await balanceOf(accountB);
    const edited = await request(http)
      .put(`/transactions/${created.body.id}`)
      .send({
        kind: 'transfer',
        date: '2026-09-17',
        description: 'Actually a transfer',
        amount: '5000',
        accountId: accountA,
        counterAccountId: accountB,
      })
      .expect(200);
    expectValid('TransactionResponse', edited.body);
    expect(edited.body.kind).toBe('transfer');
    expect(edited.body.categoryId).toBeUndefined();
    expect(await balanceOf(accountB)).toBe(beforeB + 5000n);
    expect(await entriesSumOf(edited.body.id)).toBe(0n);

    const rejected = await request(http)
      .put(`/transactions/${created.body.id}`)
      .send({
        kind: 'transfer',
        date: '2026-09-17',
        description: 'Same account loop',
        amount: '5000',
        accountId: accountA,
        counterAccountId: accountA,
      })
      .expect(422);
    expectError(rejected.body, 'DOMAIN_RULE_VIOLATION');
    const after = await request(http)
      .get('/transactions')
      .query({ accountId: accountB, kind: 'transfer', from: '2026-09-17', to: '2026-09-17' })
      .expect(200);
    expect(after.body.items.map((item: { id: string }) => item.id)).toContain(created.body.id);
  });

  it('edits amount and category on the same kind (US1 #5)', async () => {
    const created = await request(http)
      .post('/transactions')
      .send({
        kind: 'expense',
        date: '2026-09-18',
        description: 'Recategorised',
        amount: '4250',
        accountId: accountA,
        categoryId: groceriesId,
      })
      .expect(201);
    const before = await balanceOf(accountA);
    await request(http)
      .put(`/transactions/${created.body.id}`)
      .send({
        kind: 'expense',
        date: '2026-09-18',
        description: 'Recategorised',
        amount: '5000',
        accountId: accountA,
        categoryId: groceriesId,
      })
      .expect(200);
    expect(await balanceOf(accountA)).toBe(before - 750n);
  });

  it('soft-deletes: gone from lists, balance restored, ledger still balanced (US1 #6)', async () => {
    const created = await request(http)
      .post('/transactions')
      .send({
        kind: 'expense',
        date: '2026-09-19',
        description: 'To be deleted',
        amount: '1000',
        accountId: accountA,
        categoryId: groceriesId,
      })
      .expect(201);
    const before = await balanceOf(accountA);
    await request(http).delete(`/transactions/${created.body.id}`).expect(204);
    expect(await balanceOf(accountA)).toBe(before + 1000n);
    const list = await request(http)
      .get('/transactions')
      .query({ accountId: accountA })
      .expect(200);
    expect(list.body.items.map((item: { id: string }) => item.id)).not.toContain(created.body.id);
    const row = await prisma.transaction.findUnique({ where: { id: BigInt(created.body.id) } });
    expect(row?.deletedAt).not.toBeNull();
    expect(await entriesSumOf(created.body.id)).toBe(0n);
    const missing = await request(http).delete(`/transactions/${created.body.id}`).expect(404);
    expectError(missing.body, 'NOT_FOUND');
  });

  it('accepts a transaction dated before the account opening date and reflects it in balances', async () => {
    const before = await balanceOf(accountA);
    const res = await request(http)
      .post('/transactions')
      .send({
        kind: 'expense',
        date: '2026-08-15',
        description: 'Backdated before opening',
        amount: '2000',
        accountId: accountA,
        categoryId: groceriesId,
      })
      .expect(201);
    expectValid('TransactionResponse', res.body);
    expect(await balanceOf(accountA)).toBe(before - 2000n);
  });

  it('paginates deterministically by date DESC, id DESC with the total everywhere', async () => {
    const isolated = await createAccount('Tx Pagination', '0');
    for (const description of ['first', 'second', 'third', 'fourth', 'fifth']) {
      await request(http)
        .post('/transactions')
        .send({
          kind: 'expense',
          date: '2026-09-20',
          description,
          amount: '100',
          accountId: isolated,
          categoryId: groceriesId,
        })
        .expect(201);
    }
    const pageOne = await request(http)
      .get('/transactions')
      .query({ accountId: isolated, limit: 2, offset: 0 })
      .expect(200);
    expectValid('PaginatedTransactions', pageOne.body);
    expect(pageOne.body.total).toBe(5);
    expect(pageOne.body.limit).toBe(2);
    const pageTwo = await request(http)
      .get('/transactions')
      .query({ accountId: isolated, limit: 2, offset: 2 })
      .expect(200);
    const ids = [...pageOne.body.items, ...pageTwo.body.items].map((item: { id: string }) =>
      BigInt(item.id),
    );
    expect(ids).toHaveLength(4);
    expect(new Set(ids).size).toBe(4);
    for (let i = 1; i < ids.length; i += 1) {
      expect(ids[i] < ids[i - 1]).toBe(true);
    }
    expect(pageOne.body.items[0].description).toBe('fifth');

    const past = await request(http)
      .get('/transactions')
      .query({ accountId: isolated, limit: 2, offset: 50 })
      .expect(200);
    expect(past.body.items).toHaveLength(0);
    expect(past.body.total).toBe(5);
  });

  it('bounds pagination and the date range filter', async () => {
    const overLimit = await request(http).get('/transactions').query({ limit: 201 }).expect(400);
    expect(overLimit.body.code).toBe('VALIDATION_FAILED');
    expectError(overLimit.body, 'VALIDATION_FAILED');
    const zeroLimit = await request(http).get('/transactions').query({ limit: 0 }).expect(400);
    expectError(zeroLimit.body, 'VALIDATION_FAILED');
    const inverted = await request(http)
      .get('/transactions')
      .query({ from: '2026-09-10', to: '2026-09-01' })
      .expect(422);
    expectError(inverted.body, 'DOMAIN_RULE_VIOLATION');
    const tooLong = await request(http)
      .get('/transactions')
      .query({ from: '2020-01-01', to: '2026-09-01' })
      .expect(422);
    expectError(tooLong.body, 'DOMAIN_RULE_VIOLATION');
  });

  it('rejects the whole FR-008 catalogue writing nothing (US1 #7, #8, SC-006)', async () => {
    const before = await totalFor(accountA);
    const base = {
      kind: 'expense',
      date: '2026-09-10',
      description: 'Rejected',
      amount: '1000',
      accountId: accountA,
      categoryId: groceriesId,
    };
    const cases: { body: Record<string, unknown>; status: number; code: string; field?: string }[] =
      [
        { body: { ...base, amount: '0' }, status: 400, code: 'VALIDATION_FAILED', field: 'amount' },
        {
          body: { ...base, amount: '-100' },
          status: 400,
          code: 'VALIDATION_FAILED',
          field: 'amount',
        },
        { body: { ...base, amount: '1000000000000001' }, status: 400, code: 'VALIDATION_FAILED' },
        { body: { ...base, accountId: undefined }, status: 400, code: 'VALIDATION_FAILED' },
        { body: { ...base, accountId: '999999999' }, status: 422, code: 'DOMAIN_RULE_VIOLATION' },
        { body: { ...base, categoryId: '999999999' }, status: 422, code: 'DOMAIN_RULE_VIOLATION' },
        { body: { ...base, categoryId: salaryId }, status: 422, code: 'DOMAIN_RULE_VIOLATION' },
        {
          body: { ...base, categoryId: archivedCategoryId },
          status: 422,
          code: 'DOMAIN_RULE_VIOLATION',
        },
        {
          body: { ...base, accountId: archivedAccountId },
          status: 422,
          code: 'DOMAIN_RULE_VIOLATION',
        },
        { body: { ...base, date: '2999-01-01' }, status: 422, code: 'DOMAIN_RULE_VIOLATION' },
        { body: { ...base, date: '2026-02-30' }, status: 400, code: 'VALIDATION_FAILED' },
        { body: { ...base, description: '   ' }, status: 400, code: 'VALIDATION_FAILED' },
        { body: { ...base, description: 'x'.repeat(121) }, status: 400, code: 'VALIDATION_FAILED' },
        {
          body: { ...base, kind: 'opening' },
          status: 400,
          code: 'VALIDATION_FAILED',
          field: 'kind',
        },
        {
          body: {
            kind: 'transfer',
            date: '2026-09-10',
            description: 'Loop',
            amount: '1000',
            accountId: accountA,
            counterAccountId: accountA,
          },
          status: 422,
          code: 'DOMAIN_RULE_VIOLATION',
        },
        {
          body: {
            kind: 'transfer',
            date: '2026-09-10',
            description: 'With project',
            amount: '1000',
            accountId: accountA,
            counterAccountId: accountB,
            projectId: '1',
          },
          status: 400,
          code: 'VALIDATION_FAILED',
        },
      ];
    for (const testCase of cases) {
      const res = await request(http).post('/transactions').send(testCase.body);
      expect({ body: testCase.body, status: res.status }).toEqual({
        body: testCase.body,
        status: testCase.status,
      });
      expectError(res.body, testCase.code);
      expect(testCase.field === undefined || res.body.details?.[0]?.field === testCase.field).toBe(
        true,
      );
      expect(res.body.correlationId).toMatch(/^[0-9a-f-]{36}$/);
    }
    expect(await totalFor(accountA)).toBe(before);
  });

  describe('search by description (q)', () => {
    const tag = `q${run}`;
    const ids: Record<string, string> = {};

    async function post(body: Record<string, string>): Promise<string> {
      const res = await request(http).post('/transactions').send(body).expect(201);
      return res.body.id;
    }

    function search(query: Record<string, string | number>) {
      return request(http).get('/transactions').query(query);
    }

    async function descriptionsFor(query: Record<string, string | number>): Promise<string[]> {
      const res = await search(query).expect(200);
      expectValid('PaginatedTransactions', res.body);
      return res.body.items.map((item: { description: string }) => item.description);
    }

    beforeAll(async () => {
      const expense = (description: string, date: string) =>
        post({
          kind: 'expense',
          date,
          description: `${tag} ${description}`,
          amount: '100',
          accountId: accountA,
          categoryId: groceriesId,
        });
      ids.ride = await expense('Uber ride', '2026-09-05');
      ids.eats = await expense('UBER eats', '2026-09-07');
      ids.refund = await post({
        kind: 'income',
        date: '2026-09-06',
        description: `${tag} uber refund`,
        amount: '100',
        accountId: accountB,
        categoryId: salaryId,
      });
      ids.deleted = await expense('uber deleted', '2026-09-08');
      await request(http).delete(`/transactions/${ids.deleted}`).expect(204);
      await expense('lunch', '2026-09-06');
      await expense('50% off', '2026-09-06');
      await expense('5000 off', '2026-09-06');
      await expense('a_b', '2026-09-06');
      await expense('axb', '2026-09-06');
      await expense('c\\d', '2026-09-06');
      await expense('cxd', '2026-09-06');
    });

    it('matches a substring ignoring case, newest first, without soft-deleted rows', async () => {
      const res = await search({ q: `${tag} uber` }).expect(200);
      expectValid('PaginatedTransactions', res.body);
      expect(res.body.items.map((item: { id: string }) => item.id)).toEqual([
        ids.eats,
        ids.refund,
        ids.ride,
      ]);
      expect(res.body.total).toBe(3);
    });

    it('respects limit while total counts every match', async () => {
      const res = await search({ q: `${tag} UBER`, limit: 2 }).expect(200);
      expectValid('PaginatedTransactions', res.body);
      expect(res.body.items).toHaveLength(2);
      expect(res.body.total).toBe(3);
    });

    it('combines with accountId by AND', async () => {
      const res = await search({ q: `${tag} uber`, accountId: accountA }).expect(200);
      expectValid('PaginatedTransactions', res.body);
      expect(res.body.items.map((item: { id: string }) => item.id)).toEqual([ids.eats, ids.ride]);
    });

    it('matches %, _ and \\ literally', async () => {
      expect(await descriptionsFor({ q: `${tag} 50%` })).toEqual([`${tag} 50% off`]);
      expect(await descriptionsFor({ q: `${tag} a_b` })).toEqual([`${tag} a_b`]);
      expect(await descriptionsFor({ q: `${tag} c\\d` })).toEqual([`${tag} c\\d`]);
    });

    it('trims q and rejects a blank or 61-character q', async () => {
      expect(await descriptionsFor({ q: `  ${tag} lunch  ` })).toEqual([`${tag} lunch`]);
      for (const q of ['   ', 'x'.repeat(61)]) {
        const res = await search({ q }).expect(400);
        expectError(res.body, 'VALIDATION_FAILED');
      }
    });
  });
});
