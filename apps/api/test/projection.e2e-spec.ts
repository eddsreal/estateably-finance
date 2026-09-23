import { INestApplication } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { addDays, addMonthsClamped, appToday } from '../src/common/dates/dates';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/main';
import { expectError, expectValid } from './contract-validation';

const suffix = Date.now();
const today = appToday();

function endOfMonthsAhead(months: number): string {
  const [year, month] = addMonthsClamped(today, months).split('-').map(Number);
  return new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10);
}

const firstOfNextMonth = (() => {
  const [year, month] = addMonthsClamped(today, 1).split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, 1)).toISOString().slice(0, 10);
})();

describe('projection (US4)', () => {
  let app: INestApplication;
  let http: ReturnType<INestApplication['getHttpServer']>;
  let prisma: PrismaClient;
  let accountId: string;
  let groceriesId: string;
  let salaryId: string;
  const createdItems: string[] = [];

  async function createItem(body: Record<string, unknown>): Promise<string> {
    const res = await request(http).post('/scheduled-items').send(body).expect(201);
    createdItems.push(res.body.id);
    return res.body.id;
  }

  async function deleteItems(): Promise<void> {
    while (createdItems.length > 0) {
      await request(http).delete(`/scheduled-items/${createdItems.pop()}`).expect(204);
    }
  }

  async function totalBalance(): Promise<bigint> {
    const res = await request(http).get('/accounts').expect(200);
    return BigInt(res.body.totalBalance);
  }

  async function projection(horizon: string) {
    const res = await request(http).get('/projection').query({ horizon }).expect(200);
    expectValid('ProjectionResponse', res.body);
    expect(res.body.horizon).toBe(horizon);
    return res.body as {
      startingBalance: string;
      finalBalance: string;
      occurrences: {
        date: string;
        scheduledItemId: string;
        amount: string;
        runningBalance: string;
        overdue: boolean;
      }[];
    };
  }

  beforeAll(async () => {
    prisma = new PrismaClient({ adapter: new PrismaPg(process.env.DATABASE_URL ?? '') });
    await prisma.scheduledItem.deleteMany({});
    app = await NestFactory.create(AppModule, { logger: false });
    configureApp(app);
    await app.init();
    http = app.getHttpServer();

    const account = await request(http)
      .post('/accounts')
      .send({
        name: `US4 Projection ${suffix}`,
        kind: 'bank',
        openingBalance: '445750',
        openingDate: addMonthsClamped(today, -1),
      })
      .expect(201);
    accountId = account.body.id;

    const categories = await request(http).get('/categories').expect(200);
    const byName = (name: string) =>
      categories.body.find((category: { name: string }) => category.name === name);
    groceriesId = byName('Groceries').id;
    salaryId = byName('Salary').id;
  });

  afterAll(async () => {
    await deleteItems();
    await app.close();
    await prisma.$disconnect();
  });

  it('starts from the current non-archived total and matches hand-expanded occurrences (US4 #2, #3)', async () => {
    const base = await totalBalance();
    await createItem({
      kind: 'bill',
      description: `Rent p ${suffix}`,
      amount: '120000',
      accountId,
      categoryId: groceriesId,
      nextDueDate: firstOfNextMonth,
      recurrence: 'monthly',
    });
    await createItem({
      kind: 'income',
      description: `Salary p ${suffix}`,
      amount: '300000',
      accountId,
      categoryId: salaryId,
      nextDueDate: addDays(firstOfNextMonth, 4),
      recurrence: 'monthly',
    });
    await createItem({
      kind: 'bill',
      description: `Flight p ${suffix}`,
      amount: '80000',
      accountId,
      categoryId: groceriesId,
      nextDueDate: addDays(firstOfNextMonth, 11),
      recurrence: 'once',
    });

    const oneMonth = await projection(endOfMonthsAhead(1));
    expect(BigInt(oneMonth.startingBalance)).toBe(base);
    expect(BigInt(oneMonth.finalBalance)).toBe(base - 120000n + 300000n - 80000n);
    expect(oneMonth.occurrences).toHaveLength(3);
    let running = base;
    for (const occurrence of oneMonth.occurrences) {
      running +=
        occurrence.scheduledItemId === createdItems[1]
          ? BigInt(occurrence.amount)
          : -BigInt(occurrence.amount);
      expect(BigInt(occurrence.runningBalance)).toBe(running);
      expect(occurrence.overdue).toBe(false);
    }

    const twoMonths = await projection(endOfMonthsAhead(2));
    expect(BigInt(twoMonths.finalBalance)).toBe(base - 240000n + 600000n - 80000n);
    expect(twoMonths.occurrences).toHaveLength(5);

    await deleteItems();
  });

  it('expands a weekly item into one occurrence per week (US4 #4)', async () => {
    await createItem({
      kind: 'income',
      description: `Weekly p ${suffix}`,
      amount: '4500',
      accountId,
      categoryId: salaryId,
      nextDueDate: firstOfNextMonth,
      recurrence: 'weekly',
    });
    const horizon = endOfMonthsAhead(1);
    const result = await projection(horizon);
    expect(result.occurrences.map((occurrence) => occurrence.date)).toEqual(
      [0, 7, 14, 21, 28]
        .map((days) => addDays(firstOfNextMonth, days))
        .filter((date) => date <= horizon),
    );
    await deleteItems();
  });

  it('places one overdue occurrence per missed period at the start of the series (FR-017)', async () => {
    const id = await createItem({
      kind: 'bill',
      description: `Water p ${suffix}`,
      amount: '6050',
      accountId,
      categoryId: groceriesId,
      nextDueDate: today,
      recurrence: 'monthly',
    });
    await request(http)
      .put(`/scheduled-items/${id}`)
      .send({
        kind: 'bill',
        description: `Water p ${suffix}`,
        amount: '6050',
        accountId,
        categoryId: groceriesId,
        nextDueDate: addDays(today, -40),
        recurrence: 'monthly',
      })
      .expect(200);

    const result = await projection(endOfMonthsAhead(1));
    const overdue = result.occurrences.filter((occurrence) => occurrence.overdue);
    expect(overdue).toHaveLength(2);
    expect(result.occurrences.slice(0, 2)).toEqual(overdue);
    expect(overdue[0].date).toBe(addDays(today, -40));
    await deleteItems();
  });

  it('counts an item due today until it is confirmed, then drops it (edge case)', async () => {
    const base = await totalBalance();
    const id = await createItem({
      kind: 'bill',
      description: `Due today p ${suffix}`,
      amount: '2500',
      accountId,
      categoryId: groceriesId,
      nextDueDate: today,
      recurrence: 'once',
    });
    const before = await projection(endOfMonthsAhead(1));
    expect(before.occurrences).toHaveLength(1);
    expect(before.occurrences[0]).toMatchObject({ date: today, overdue: false });
    expect(BigInt(before.finalBalance)).toBe(base - 2500n);

    await request(http)
      .post(`/scheduled-items/${id}/confirm`)
      .send({
        amount: '2500',
        date: today,
        accountId,
        categoryId: groceriesId,
        description: `Due today p ${suffix}`,
      })
      .expect(201);
    createdItems.pop();

    const after = await projection(endOfMonthsAhead(1));
    expect(after.occurrences).toHaveLength(0);
    expect(BigInt(after.startingBalance)).toBe(base - 2500n);
    expect(BigInt(after.finalBalance)).toBe(base - 2500n);
  });

  it('cuts the expansion off at the end date (US4 #8)', async () => {
    await createItem({
      kind: 'bill',
      description: `Trial p ${suffix}`,
      amount: '5000',
      accountId,
      categoryId: groceriesId,
      nextDueDate: firstOfNextMonth,
      recurrence: 'monthly',
      endDate: addMonthsClamped(firstOfNextMonth, 1),
    });
    const result = await projection(endOfMonthsAhead(6));
    expect(result.occurrences.map((occurrence) => occurrence.date)).toEqual([
      firstOfNextMonth,
      addMonthsClamped(firstOfNextMonth, 1),
    ]);
    await deleteItems();
  });

  it('rejects a horizon more than 24 months ahead with a validation error', async () => {
    const res = await request(http)
      .get('/projection')
      .query({ horizon: addDays(addMonthsClamped(today, 24), 1) })
      .expect(400);
    expectError(res.body, 'VALIDATION_FAILED');

    const boundary = await request(http)
      .get('/projection')
      .query({ horizon: addMonthsClamped(today, 24) })
      .expect(200);
    expectValid('ProjectionResponse', boundary.body);
    expect(boundary.body.horizon).toBe(addMonthsClamped(today, 24));
  });
});
