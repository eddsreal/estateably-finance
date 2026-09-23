import { INestApplication } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { addDays, addMonthsClamped, appToday } from '../src/common/dates/dates';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/main';
import { expectError, expectValid } from './contract-validation';

const suffix = Date.now();
const today = appToday();

describe('scheduled items (US4)', () => {
  let app: INestApplication;
  let http: ReturnType<INestApplication['getHttpServer']>;
  let accountId: string;
  let archivedAccountId: string;
  let groceriesId: string;
  let salaryId: string;

  function itemBody(overrides: Record<string, unknown> = {}) {
    return {
      kind: 'bill',
      description: `Rent us4 ${suffix}`,
      amount: '120000',
      accountId,
      categoryId: groceriesId,
      nextDueDate: addDays(today, 7),
      recurrence: 'monthly',
      ...overrides,
    };
  }

  async function listMine(): Promise<{ id: string; description: string }[]> {
    const res = await request(http).get('/scheduled-items').expect(200);
    for (const item of res.body) expectValid('ScheduledItemResponse', item);
    return res.body.filter((item: { description: string }) =>
      item.description.includes(`${suffix}`),
    );
  }

  beforeAll(async () => {
    app = await NestFactory.create(AppModule, { logger: false });
    configureApp(app);
    await app.init();
    http = app.getHttpServer();

    const account = await request(http)
      .post('/accounts')
      .send({
        name: `US4 Checking ${suffix}`,
        kind: 'bank',
        openingBalance: '445750',
        openingDate: addMonthsClamped(today, -1),
      })
      .expect(201);
    accountId = account.body.id;

    const archived = await request(http)
      .post('/accounts')
      .send({
        name: `US4 Archived ${suffix}`,
        kind: 'bank',
        openingBalance: '0',
        openingDate: addMonthsClamped(today, -1),
      })
      .expect(201);
    archivedAccountId = archived.body.id;
    await request(http).post(`/accounts/${archivedAccountId}/archive`).expect(200);

    const categories = await request(http).get('/categories').expect(200);
    const byName = (name: string) =>
      categories.body.find((category: { name: string }) => category.name === name);
    groceriesId = byName('Groceries').id;
    salaryId = byName('Salary').id;
  });

  afterAll(async () => {
    await app.close();
  });

  it('creates, lists, updates and deletes a scheduled item', async () => {
    const created = await request(http).post('/scheduled-items').send(itemBody()).expect(201);
    expectValid('ScheduledItemResponse', created.body);
    expect(created.body).toMatchObject({
      kind: 'bill',
      amount: '120000',
      nextDueDate: addDays(today, 7),
      recurrence: 'monthly',
      status: 'active',
      overdue: false,
      overdueCount: 0,
      accountArchived: false,
    });

    const listed = await listMine();
    expect(listed.map((item) => item.id)).toContain(created.body.id);

    const updated = await request(http)
      .put(`/scheduled-items/${created.body.id}`)
      .send(itemBody({ amount: '130000', recurrence: 'weekly' }))
      .expect(200);
    expectValid('ScheduledItemResponse', updated.body);
    expect(updated.body.amount).toBe('130000');
    expect(updated.body.recurrence).toBe('weekly');

    await request(http).delete(`/scheduled-items/${created.body.id}`).expect(204);
    expect((await listMine()).map((item) => item.id)).not.toContain(created.body.id);
  });

  it('flags an item edited into the past as overdue with one count per missed period', async () => {
    const created = await request(http).post('/scheduled-items').send(itemBody()).expect(201);
    const updated = await request(http)
      .put(`/scheduled-items/${created.body.id}`)
      .send(itemBody({ nextDueDate: addDays(today, -40) }))
      .expect(200);
    expectValid('ScheduledItemResponse', updated.body);
    expect(updated.body.overdue).toBe(true);
    expect(updated.body.overdueCount).toBe(2);
    await request(http).delete(`/scheduled-items/${created.body.id}`).expect(204);
  });

  it('rejects every FR-016 violation without writing anything (SC-006)', async () => {
    const before = await listMine();
    const cases: { body: Record<string, unknown>; status: number; code: string }[] = [
      { body: itemBody({ amount: '0' }), status: 400, code: 'VALIDATION_FAILED' },
      { body: itemBody({ amount: '-500' }), status: 400, code: 'VALIDATION_FAILED' },
      { body: itemBody({ amount: '1000000000000001' }), status: 400, code: 'VALIDATION_FAILED' },
      {
        body: itemBody({ nextDueDate: addDays(today, -1) }),
        status: 422,
        code: 'DOMAIN_RULE_VIOLATION',
      },
      { body: itemBody({ accountId: '999999999' }), status: 422, code: 'DOMAIN_RULE_VIOLATION' },
      {
        body: itemBody({ accountId: archivedAccountId }),
        status: 422,
        code: 'DOMAIN_RULE_VIOLATION',
      },
      { body: itemBody({ categoryId: '999999999' }), status: 422, code: 'DOMAIN_RULE_VIOLATION' },
      { body: itemBody({ categoryId: salaryId }), status: 422, code: 'DOMAIN_RULE_VIOLATION' },
      {
        body: itemBody({ kind: 'income', categoryId: groceriesId }),
        status: 422,
        code: 'DOMAIN_RULE_VIOLATION',
      },
      {
        body: itemBody({ endDate: addDays(today, 6) }),
        status: 422,
        code: 'DOMAIN_RULE_VIOLATION',
      },
      { body: itemBody({ description: '   ' }), status: 400, code: 'VALIDATION_FAILED' },
    ];
    for (const testCase of cases) {
      const res = await request(http)
        .post('/scheduled-items')
        .send(testCase.body)
        .expect(testCase.status);
      expectError(res.body, testCase.code);
    }
    expect(await listMine()).toEqual(before);
  });

  it('confirms with a changed amount and date, keeping the item template (US4 #7a)', async () => {
    const created = await request(http)
      .post('/scheduled-items')
      .send(itemBody({ nextDueDate: today }))
      .expect(201);

    const confirmed = await request(http)
      .post(`/scheduled-items/${created.body.id}/confirm`)
      .send({
        amount: '125000',
        date: today,
        accountId,
        categoryId: groceriesId,
        description: `Rent paid us4 ${suffix}`,
      })
      .expect(201);
    expectValid('ConfirmScheduledItemResponse', confirmed.body);
    expect(confirmed.body.transaction).toMatchObject({
      kind: 'expense',
      amount: '125000',
      date: today,
      accountId,
      categoryId: groceriesId,
    });
    expect(confirmed.body.item.amount).toBe('120000');
    expect(confirmed.body.item.nextDueDate).toBe(addMonthsClamped(today, 1));
    expect(confirmed.body.item.status).toBe('active');

    const transactions = await request(http).get('/transactions').query({ accountId }).expect(200);
    const recorded = transactions.body.items.find(
      (transaction: { id: string }) => transaction.id === confirmed.body.transaction.id,
    );
    expect(recorded).toMatchObject({ amount: '125000', kind: 'expense' });

    await request(http).delete(`/scheduled-items/${created.body.id}`).expect(204);
  });

  it('completes a once item on confirmation and removes it from the list', async () => {
    const created = await request(http)
      .post('/scheduled-items')
      .send(
        itemBody({ recurrence: 'once', nextDueDate: today, description: `Flight us4 ${suffix}` }),
      )
      .expect(201);
    const confirmed = await request(http)
      .post(`/scheduled-items/${created.body.id}/confirm`)
      .send({
        amount: '80000',
        date: today,
        accountId,
        categoryId: groceriesId,
        description: `Flight us4 ${suffix}`,
      })
      .expect(201);
    expect(confirmed.body.item.status).toBe('completed');
    expect((await listMine()).map((item) => item.id)).not.toContain(created.body.id);
  });

  it('completes an item whose advanced due date would pass its end date', async () => {
    const created = await request(http)
      .post('/scheduled-items')
      .send(itemBody({ nextDueDate: today, endDate: addDays(today, 10) }))
      .expect(201);
    const confirmed = await request(http)
      .post(`/scheduled-items/${created.body.id}/confirm`)
      .send({
        amount: '120000',
        date: today,
        accountId,
        categoryId: groceriesId,
        description: `Last rent us4 ${suffix}`,
      })
      .expect(201);
    expect(confirmed.body.item.status).toBe('completed');
  });

  it('rejects a confirmation on an archived account and leaves the item unchanged', async () => {
    const created = await request(http)
      .post('/scheduled-items')
      .send(itemBody({ nextDueDate: today }))
      .expect(201);
    const res = await request(http)
      .post(`/scheduled-items/${created.body.id}/confirm`)
      .send({
        amount: '120000',
        date: today,
        accountId: archivedAccountId,
        categoryId: groceriesId,
        description: `Rent us4 ${suffix}`,
      })
      .expect(422);
    expectError(res.body, 'DOMAIN_RULE_VIOLATION');

    const listed = await listMine();
    const item = listed.find((candidate) => candidate.id === created.body.id) as unknown as {
      nextDueDate: string;
      status: string;
    };
    expect(item).toMatchObject({ nextDueDate: today, status: 'active' });
    await request(http).delete(`/scheduled-items/${created.body.id}`).expect(204);
  });

  it('404s operations on a missing item', async () => {
    const missing = await request(http).put('/scheduled-items/999999999').send(itemBody());
    expect(missing.status).toBe(404);
    expectError(missing.body, 'NOT_FOUND');
    const gone = await request(http).delete('/scheduled-items/999999999');
    expect(gone.status).toBe(404);
    const confirm = await request(http).post('/scheduled-items/999999999/confirm').send({
      amount: '1000',
      date: today,
      accountId,
      categoryId: groceriesId,
      description: 'x',
    });
    expect(confirm.status).toBe(404);
  });
});
