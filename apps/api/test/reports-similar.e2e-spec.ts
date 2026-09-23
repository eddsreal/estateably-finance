import { INestApplication } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { randomInt } from 'node:crypto';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/main';
import { expectError, expectValid } from './contract-validation';

const suffix = Date.now();
const month = `${randomInt(1901, 2000)}-${String(randomInt(1, 13)).padStart(2, '0')}`;
const from = `${month}-01`;
const to = `${month}-27`;

type ReportTransaction = { id: string; description: string; amount: string; kind: string };
type SimilarReport = {
  from: string;
  to: string;
  groups: { key: string; count: number; total: string; transactions: ReportTransaction[] }[];
  topTransactions: ReportTransaction[];
  topGroupKey: string | null;
};

describe('similar-transaction report (US6)', () => {
  let app: INestApplication;
  let http: ReturnType<INestApplication['getHttpServer']>;

  async function report(query: { from: string; to: string }): Promise<SimilarReport> {
    const res = await request(http).get('/reports/similar').query(query).expect(200);
    expectValid('SimilarReportResponse', res.body);
    return res.body;
  }

  beforeAll(async () => {
    app = await NestFactory.create(AppModule, { logger: false });
    configureApp(app);
    await app.init();
    http = app.getHttpServer();

    const account = async (name: string) =>
      (
        await request(http)
          .post('/accounts')
          .send({
            name: `${name} ${suffix}`,
            kind: 'bank',
            openingBalance: '500000',
            openingDate: from,
          })
          .expect(201)
      ).body.id as string;
    const checkingId = await account('US6 Checking');
    const savingsId = await account('US6 Savings');

    const categories = await request(http).get('/categories').expect(200);
    const categoryId = (name: string) =>
      categories.body.find((category: { name: string }) => category.name === name).id;

    const expense = (day: string, description: string, amount: string, category: string) =>
      request(http)
        .post('/transactions')
        .send({
          kind: 'expense',
          date: `${month}-${day}`,
          description,
          amount,
          accountId: checkingId,
          categoryId: categoryId(category),
        })
        .expect(201);

    await expense('03', 'Uber 1234', '1830', 'Transport');
    await expense('09', 'UBER  5678', '2100', 'Transport');
    await expense('15', 'uber', '950', 'Transport');
    await expense('04', 'Netflix', '1599', 'Entertainment');
    await expense('01', 'Rent', '120000', 'Rent');
    await expense('05', 'Market', '7240', 'Groceries');
    await expense('06', 'Pharmacy', '4000', 'Health');
    await request(http)
      .post('/transactions')
      .send({
        kind: 'income',
        date: `${month}-02`,
        description: 'Uber refund 99',
        amount: '900000',
        accountId: checkingId,
        categoryId: categoryId('Salary'),
      })
      .expect(201);
    await request(http)
      .post('/transactions')
      .send({
        kind: 'transfer',
        date: `${month}-02`,
        description: 'Uber savings',
        amount: '800000',
        accountId: checkingId,
        counterAccountId: savingsId,
      })
      .expect(201);
  });

  afterAll(async () => {
    await app.close();
  });

  it('groups the three Uber expenses into one group of 3 with their summed amount (US6 #1)', async () => {
    const body = await report({ from, to });
    expect(body.from).toBe(from);
    expect(body.to).toBe(to);
    const uber = body.groups.find((group) => group.key === 'uber')!;
    expect(uber.count).toBe(3);
    expect(uber.total).toBe('4880');
    expect(uber.transactions.map((row) => row.description)).toEqual([
      'uber',
      'UBER  5678',
      'Uber 1234',
    ]);
    const kinds = body.groups.flatMap((group) => group.transactions.map((row) => row.kind));
    expect(new Set(kinds)).toEqual(new Set(['expense']));
  });

  it('orders groups by total descending', async () => {
    const body = await report({ from, to });
    expect(body.groups.map((group) => [group.key, group.count, group.total])).toEqual([
      ['rent', 1, '120000'],
      ['market', 1, '7240'],
      ['uber', 3, '4880'],
      ['pharmacy', 1, '4000'],
      ['netflix', 1, '1599'],
    ]);
  });

  it('highlights the five most expensive transactions and the top group (US6 #2)', async () => {
    const body = await report({ from, to });
    expect(body.topTransactions.map((row) => [row.description, row.amount])).toEqual([
      ['Rent', '120000'],
      ['Market', '7240'],
      ['Pharmacy', '4000'],
      ['UBER  5678', '2100'],
      ['Uber 1234', '1830'],
    ]);
    expect(body.topGroupKey).toBe('rent');
  });

  it('answers the same report on a second run (US6 #4)', async () => {
    expect(await report({ from, to })).toEqual(await report({ from, to }));
  });

  it('answers an empty period as an empty report without error (US6 #3)', async () => {
    const body = await report({ from: `${month}-28`, to: `${month}-28` });
    expect(body).toEqual({
      from: `${month}-28`,
      to: `${month}-28`,
      groups: [],
      topTransactions: [],
      topGroupKey: null,
    });
  });

  it('rejects inverted, over-long, missing and malformed ranges with the structured error', async () => {
    const inverted = await request(http)
      .get('/reports/similar')
      .query({ from: to, to: from })
      .expect(422);
    expect(inverted.body.code).toBe('DOMAIN_RULE_VIOLATION');
    expectError(inverted.body, 'DOMAIN_RULE_VIOLATION');
    const tooLong = await request(http)
      .get('/reports/similar')
      .query({ from: '2020-01-01', to: '2022-01-02' })
      .expect(422);
    expectError(tooLong.body, 'DOMAIN_RULE_VIOLATION');
    const missing = await request(http).get('/reports/similar').query({ from }).expect(400);
    expectError(missing.body, 'VALIDATION_FAILED');
    const malformed = await request(http)
      .get('/reports/similar')
      .query({ from: '2026-02-30', to })
      .expect(400);
    expectError(malformed.body, 'VALIDATION_FAILED');
  });
});
