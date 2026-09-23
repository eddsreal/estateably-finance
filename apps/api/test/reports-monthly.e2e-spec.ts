import { INestApplication } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/main';
import { expectError, expectValid } from './contract-validation';

const suffix = Date.now();
const reportMonth = '2019-05';
const nextMonth = '2019-06';
const emptyMonth = '2019-04';

describe('monthly report (US3)', () => {
  let app: INestApplication;
  let http: ReturnType<INestApplication['getHttpServer']>;
  let checkingId: string;
  let savingsId: string;
  let groceriesId: string;
  let rentId: string;
  let salaryId: string;
  let movableId: string;

  async function report(month: string) {
    const res = await request(http).get('/reports/monthly').query({ month }).expect(200);
    expectValid('MonthlyReportResponse', res.body);
    expect(res.body.month).toBe(month);
    return res.body as {
      month: string;
      grandTotal: string;
      categories: {
        categoryId: string;
        categoryName: string;
        total: string;
        transactions: {
          id: string;
          kind: string;
          date: string;
          description: string;
          amount: string;
        }[];
      }[];
    };
  }

  async function recordTransaction(body: Record<string, string>): Promise<string> {
    const res = await request(http).post('/transactions').send(body).expect(201);
    return res.body.id;
  }

  beforeAll(async () => {
    app = await NestFactory.create(AppModule, { logger: false });
    configureApp(app);
    await app.init();
    http = app.getHttpServer();

    const account = (name: string) =>
      request(http)
        .post('/accounts')
        .send({
          name: `${name} ${suffix}`,
          kind: 'bank',
          openingBalance: '150000',
          openingDate: `${reportMonth}-01`,
        })
        .expect(201);
    checkingId = (await account('US3 Checking')).body.id;
    savingsId = (await account('US3 Savings')).body.id;

    const categories = await request(http).get('/categories').expect(200);
    const byName = (name: string) =>
      categories.body.find((category: { name: string }) => category.name === name);
    groceriesId = byName('Groceries').id;
    rentId = byName('Rent').id;
    salaryId = byName('Salary').id;

    movableId = await recordTransaction({
      kind: 'expense',
      date: `${reportMonth}-05`,
      description: 'Market run',
      amount: '4250',
      accountId: checkingId,
      categoryId: groceriesId,
    });
    await recordTransaction({
      kind: 'expense',
      date: `${reportMonth}-10`,
      description: 'Farmers market',
      amount: '3000',
      accountId: checkingId,
      categoryId: groceriesId,
    });
    await recordTransaction({
      kind: 'expense',
      date: `${reportMonth}-01`,
      description: 'May rent',
      amount: '12000',
      accountId: checkingId,
      categoryId: rentId,
    });
    await recordTransaction({
      kind: 'income',
      date: `${reportMonth}-15`,
      description: 'May salary',
      amount: '300000',
      accountId: checkingId,
      categoryId: salaryId,
    });
    await recordTransaction({
      kind: 'transfer',
      date: `${reportMonth}-16`,
      description: 'To savings',
      amount: '50000',
      accountId: checkingId,
      counterAccountId: savingsId,
    });
  });

  afterAll(async () => {
    await app.close();
  });

  it('totals $72.50 Groceries and $120.00 Rent into a $192.50 grand total, income and transfer absent (US3 #1)', async () => {
    const body = await report(reportMonth);
    expect(body.grandTotal).toBe('19250');
    expect(body.categories.map((category) => [category.categoryName, category.total])).toEqual([
      ['Rent', '12000'],
      ['Groceries', '7250'],
    ]);
    const kinds = body.categories.flatMap((category) =>
      category.transactions.map((row) => row.kind),
    );
    expect(new Set(kinds)).toEqual(new Set(['expense']));
  });

  it('answers an empty month as no categories and a "0" total (US3 #2)', async () => {
    const body = await report(emptyMonth);
    expect(body.grandTotal).toBe('0');
    expect(body.categories).toEqual([]);
  });

  it('lists the drill-down rows behind each total, date descending (US3 #3)', async () => {
    const body = await report(reportMonth);
    const groceries = body.categories.find((category) => category.categoryId === groceriesId)!;
    expect(groceries.transactions.map((row) => [row.description, row.amount, row.date])).toEqual([
      ['Farmers market', '3000', `${reportMonth}-10`],
      ['Market run', '4250', `${reportMonth}-05`],
    ]);
    const summed = groceries.transactions.reduce((sum, row) => sum + BigInt(row.amount), 0n);
    expect(summed).toBe(BigInt(groceries.total));
  });

  it('moves an edited expense between the two months’ reports (US3 #5, SC-004)', async () => {
    await request(http)
      .put(`/transactions/${movableId}`)
      .send({
        kind: 'expense',
        date: `${nextMonth}-05`,
        description: 'Market run',
        amount: '4250',
        accountId: checkingId,
        categoryId: groceriesId,
      })
      .expect(200);

    const may = await report(reportMonth);
    expect(may.grandTotal).toBe('15000');
    const mayGroceries = may.categories.find((category) => category.categoryId === groceriesId)!;
    expect(mayGroceries.total).toBe('3000');
    expect(mayGroceries.transactions.map((row) => row.id)).not.toContain(movableId);

    const june = await report(nextMonth);
    expect(june.grandTotal).toBe('4250');
    expect(june.categories).toHaveLength(1);
    expect(june.categories[0].categoryId).toBe(groceriesId);
    expect(june.categories[0].transactions.map((row) => row.id)).toEqual([movableId]);
  });

  it('rejects a missing or malformed month with a structured validation error', async () => {
    const missing = await request(http).get('/reports/monthly').expect(400);
    expect(missing.body.code).toBe('VALIDATION_FAILED');
    expectError(missing.body, 'VALIDATION_FAILED');

    const malformed = await request(http)
      .get('/reports/monthly')
      .query({ month: '2019-13' })
      .expect(400);
    expectError(malformed.body, 'VALIDATION_FAILED');

    const notAMonth = await request(http)
      .get('/reports/monthly')
      .query({ month: 'May 2019' })
      .expect(400);
    expectError(notAMonth.body, 'VALIDATION_FAILED');
  });
});
