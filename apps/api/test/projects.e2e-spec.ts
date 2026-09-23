import { INestApplication } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/main';
import { expectError, expectValid } from './contract-validation';

const run = Date.now();

describe('projects (US5)', () => {
  let app: INestApplication;
  let http: ReturnType<INestApplication['getHttpServer']>;
  let checking: string;
  let savings: string;
  let travelId: string;
  let diningId: string;
  let salaryId: string;
  let tripId: string;
  let flightsId: string;

  async function createAccount(name: string): Promise<string> {
    const res = await request(http)
      .post('/accounts')
      .send({
        name: `${name} ${run}`,
        kind: 'bank',
        openingBalance: '1000000',
        openingDate: '2026-09-01',
      })
      .expect(201);
    return res.body.id;
  }

  async function project(id: string): Promise<Record<string, unknown>> {
    const res = await request(http).get('/projects').expect(200);
    for (const item of res.body) expectValid('ProjectResponse', item);
    return res.body.find((item: { id: string }) => item.id === id);
  }

  function expense(
    description: string,
    amount: string,
    accountId: string,
    projectId?: string,
    categoryId = travelId,
  ): request.Test {
    return request(http)
      .post('/transactions')
      .send({
        kind: 'expense',
        date: '2026-09-10',
        description,
        amount,
        accountId,
        categoryId,
        ...(projectId === undefined ? {} : { projectId }),
      });
  }

  async function transactionCount(): Promise<number> {
    const res = await request(http).get('/transactions').query({ limit: 1 }).expect(200);
    return res.body.total;
  }

  beforeAll(async () => {
    app = await NestFactory.create(AppModule, { logger: false });
    configureApp(app);
    await app.init();
    http = app.getHttpServer();

    checking = await createAccount('Project Checking');
    savings = await createAccount('Project Savings');
    const categories = await request(http)
      .get('/categories')
      .query({ includeArchived: 'true' })
      .expect(200);
    const byName = (name: string) =>
      categories.body.find((category: { name: string }) => category.name === name).id;
    travelId = byName('Travel');
    diningId = byName('Dining');
    salaryId = byName('Salary');
  });

  afterAll(async () => {
    await app.close();
  });

  it('creates a project with a budget: active, nothing spent, all remaining (US5 #1)', async () => {
    const res = await request(http)
      .post('/projects')
      .send({ name: `  Trip to France ${run}  `, budget: '500000' })
      .expect(201);
    expectValid('ProjectResponse', res.body);
    tripId = res.body.id;
    expect(res.body).toEqual({
      id: tripId,
      name: `Trip to France ${run}`,
      status: 'active',
      budget: '500000',
      spent: '0',
      remaining: '500000',
      overBudget: false,
    });
  });

  it('sums tagged expenses across two accounts and categories and lists them; untagged ones do not count (US5 #2, #3)', async () => {
    const flights = await expense('Flights', '80000', checking, tripId).expect(201);
    flightsId = flights.body.id;
    await expense('Hotel deposit', '30000', savings, tripId, diningId).expect(201);
    await expense('Unrelated taxi', '2500', checking).expect(201);

    expect(await project(tripId)).toMatchObject({
      spent: '110000',
      remaining: '390000',
      overBudget: false,
    });

    const list = await request(http).get(`/projects/${tripId}/transactions`).expect(200);
    expectValid('PaginatedTransactions', list.body);
    expect(list.body.total).toBe(2);
    expect(
      list.body.items.map(
        (item: { description: string; accountId: string; categoryId: string }) => [
          item.description,
          item.accountId,
          item.categoryId,
        ],
      ),
    ).toEqual(
      expect.arrayContaining([
        ['Flights', checking, travelId],
        ['Hotel deposit', savings, diningId],
      ]),
    );
    for (const item of list.body.items) expect(item.projectId).toBe(tripId);

    const paged = await request(http)
      .get(`/projects/${tripId}/transactions`)
      .query({ limit: 1, offset: 1 })
      .expect(200);
    expectValid('PaginatedTransactions', paged.body);
    expect(paged.body).toMatchObject({ total: 2, limit: 1, offset: 1 });
    expect(paged.body.items).toHaveLength(1);
  });

  it('flags over budget with the overrun as a negative remaining (US5 #4)', async () => {
    const res = await expense('Château night', '420000', checking, tripId).expect(201);
    expect(await project(tripId)).toMatchObject({
      spent: '530000',
      remaining: '-30000',
      overBudget: true,
    });
    await request(http).delete(`/transactions/${res.body.id}`).expect(204);
    expect(await project(tripId)).toMatchObject({ spent: '110000', overBudget: false });
  });

  it('drops an expense from the total when its project is removed by an edit (US5 #5)', async () => {
    await request(http)
      .put(`/transactions/${flightsId}`)
      .send({
        kind: 'expense',
        date: '2026-09-10',
        description: 'Flights',
        amount: '80000',
        accountId: checking,
        categoryId: travelId,
      })
      .expect(200);
    expect(await project(tripId)).toMatchObject({ spent: '30000', remaining: '470000' });
  });

  it('rejects deleting a used project, then closes and reopens it with its report intact (US5 #6, FR-020)', async () => {
    const rejected = await request(http).delete(`/projects/${tripId}`).expect(422);
    expectError(rejected.body, 'DOMAIN_RULE_VIOLATION');
    expect(rejected.body.message).toMatch(/close it instead/);

    const closed = await request(http).post(`/projects/${tripId}/close`).expect(200);
    expectValid('ProjectResponse', closed.body);
    expect(closed.body).toMatchObject({ status: 'closed', spent: '30000' });

    const before = await transactionCount();
    const onNew = await expense('Late booking', '1000', checking, tripId).expect(422);
    expectError(onNew.body, 'DOMAIN_RULE_VIOLATION');
    expect(onNew.body.details).toEqual([{ field: 'projectId', message: 'project is closed' }]);
    const onEdit = await request(http)
      .put(`/transactions/${flightsId}`)
      .send({
        kind: 'expense',
        date: '2026-09-10',
        description: 'Flights',
        amount: '80000',
        accountId: checking,
        categoryId: travelId,
        projectId: tripId,
      })
      .expect(422);
    expectError(onEdit.body, 'DOMAIN_RULE_VIOLATION');
    expect(await transactionCount()).toBe(before);

    const readable = await request(http).get(`/projects/${tripId}/transactions`).expect(200);
    expect(readable.body.total).toBe(1);

    const reopened = await request(http).post(`/projects/${tripId}/reopen`).expect(200);
    expectValid('ProjectResponse', reopened.body);
    expect(reopened.body).toMatchObject({ status: 'active', spent: '30000' });
    await expense('Late booking', '1000', checking, tripId).expect(201);
    expect(await project(tripId)).toMatchObject({ spent: '31000' });
  });

  it('rejects a project on an income or a transfer and writes nothing (US5 #7, SC-006)', async () => {
    const before = await transactionCount();
    const cases = [
      {
        kind: 'income',
        date: '2026-09-10',
        description: 'Refund',
        amount: '1000',
        accountId: checking,
        categoryId: salaryId,
        projectId: tripId,
      },
      {
        kind: 'transfer',
        date: '2026-09-10',
        description: 'Move',
        amount: '1000',
        accountId: checking,
        counterAccountId: savings,
        projectId: tripId,
      },
    ];
    for (const body of cases) {
      const res = await request(http).post('/transactions').send(body).expect(400);
      expectError(res.body, 'VALIDATION_FAILED');
      expect(res.body.details).toEqual(
        expect.arrayContaining([expect.objectContaining({ field: 'projectId' })]),
      );
    }
    const missing = await expense('Ghost', '1000', checking, '999999999').expect(422);
    expectError(missing.body, 'DOMAIN_RULE_VIOLATION');
    expect(await transactionCount()).toBe(before);
  });

  it('shows no budget as absent fields, never zero, and removes a budget with null (US5 #8)', async () => {
    const created = await request(http)
      .post('/projects')
      .send({ name: `Remodel ${run}` })
      .expect(201);
    expectValid('ProjectResponse', created.body);
    expect(created.body).toEqual({
      id: created.body.id,
      name: `Remodel ${run}`,
      status: 'active',
      spent: '0',
      overBudget: false,
    });

    const budgeted = await request(http)
      .patch(`/projects/${created.body.id}`)
      .send({ budget: '100000' })
      .expect(200);
    expect(budgeted.body).toMatchObject({ budget: '100000', remaining: '100000' });

    const cleared = await request(http)
      .patch(`/projects/${created.body.id}`)
      .send({ budget: null })
      .expect(200);
    expectValid('ProjectResponse', cleared.body);
    expect(cleared.body).not.toHaveProperty('budget');
    expect(cleared.body).not.toHaveProperty('remaining');
    expect(cleared.body.name).toBe(`Remodel ${run}`);
  });

  it('rejects invalid project requests with the structured error and writes nothing', async () => {
    const countBefore = (await request(http).get('/projects').expect(200)).body.length;
    const cases: { body: object; status: number; code: string; field?: string }[] = [
      {
        body: { name: 'Zero', budget: '0' },
        status: 400,
        code: 'VALIDATION_FAILED',
        field: 'budget',
      },
      {
        body: { name: 'Negative', budget: '-100' },
        status: 400,
        code: 'VALIDATION_FAILED',
        field: 'budget',
      },
      {
        body: { name: 'Float', budget: 100 },
        status: 400,
        code: 'VALIDATION_FAILED',
        field: 'budget',
      },
      {
        body: { name: 'Null', budget: null },
        status: 400,
        code: 'VALIDATION_FAILED',
        field: 'budget',
      },
      { body: { name: '   ' }, status: 400, code: 'VALIDATION_FAILED', field: 'name' },
      { body: { name: 'x'.repeat(61) }, status: 400, code: 'VALIDATION_FAILED', field: 'name' },
      {
        body: { name: `  TRIP TO FRANCE ${run} ` },
        status: 409,
        code: 'DUPLICATE_NAME',
        field: 'name',
      },
    ];
    for (const testCase of cases) {
      const res = await request(http).post('/projects').send(testCase.body);
      expect({ body: testCase.body, status: res.status }).toEqual({
        body: testCase.body,
        status: testCase.status,
      });
      expectError(res.body, testCase.code);
      expect(res.body.details?.[0]?.field).toBe(testCase.field);
    }

    const empty = await request(http).patch(`/projects/${tripId}`).send({}).expect(400);
    expectError(empty.body, 'VALIDATION_FAILED');
    const zero = await request(http).patch(`/projects/${tripId}`).send({ budget: '0' }).expect(400);
    expectError(zero.body, 'VALIDATION_FAILED');

    expect((await request(http).get('/projects').expect(200)).body.length).toBe(countBefore);
    expect(await project(tripId)).toMatchObject({ budget: '500000' });
  });

  it('deletes an unused project; a soft-deleted expense still counts as a use', async () => {
    const unused = await request(http)
      .post('/projects')
      .send({ name: `Unused ${run}` })
      .expect(201);
    await request(http).delete(`/projects/${unused.body.id}`).expect(204);
    const gone = await request(http).post(`/projects/${unused.body.id}/close`).expect(404);
    expectError(gone.body, 'NOT_FOUND');
    expectError(
      (await request(http).get(`/projects/${unused.body.id}/transactions`).expect(404)).body,
      'NOT_FOUND',
    );

    const once = await request(http)
      .post('/projects')
      .send({ name: `Once used ${run}` })
      .expect(201);
    const tagged = await expense('Deposit', '1000', checking, once.body.id).expect(201);
    await request(http).delete(`/transactions/${tagged.body.id}`).expect(204);
    expect(await project(once.body.id)).toMatchObject({ spent: '0' });
    const rejected = await request(http).delete(`/projects/${once.body.id}`).expect(422);
    expectError(rejected.body, 'DOMAIN_RULE_VIOLATION');
  });
});
