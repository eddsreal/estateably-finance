import { beforeEach, describe, expect, it, vi } from 'vitest';
import { addDays, addMonthsClamped, appToday } from '../../../common/dates/dates';
import {
  DomainRuleViolationError,
  NotFoundError,
  ValidationFailedError,
} from '../../../common/domain-errors/domain-errors';
import { PrismaService, TransactionClient } from '../../../common/prisma.service/prisma.service';
import { AccountsService } from '../../accounts/services/accounts.service';
import { TransactionsService } from '../../accounts/services/transactions.service';
import { CategoriesService } from '../../categories/services/categories.service';
import { ScheduledItemsRepository } from '../repositories/scheduled-items.repository';
import { ScheduledItemInput, ScheduledItemsService } from './scheduled-items.service';

const fakeTx = { fake: true } as unknown as TransactionClient;
const today = appToday();

function row(overrides: Record<string, unknown> = {}) {
  return {
    id: 7n,
    kind: 'bill',
    description: 'Rent',
    amount: 120000n,
    accountId: 1n,
    categoryId: 3n,
    nextDueDate: new Date('2026-10-01T00:00:00Z'),
    recurrence: 'monthly',
    endDate: null,
    status: 'active',
    account: { archived: false },
    ...overrides,
  };
}

const input: ScheduledItemInput = {
  kind: 'bill',
  description: 'Rent',
  amount: 120000n,
  accountId: 1n,
  categoryId: 3n,
  nextDueDate: addDays(today, 7),
  recurrence: 'monthly',
};

function build() {
  const asyncMock = () => vi.fn<(...args: unknown[]) => Promise<unknown>>();
  const mocks = {
    prisma: {
      withTransaction: vi.fn<(fn: (tx: TransactionClient) => Promise<unknown>) => Promise<unknown>>(
        (fn) => fn(fakeTx),
      ),
    },
    items: {
      create: asyncMock().mockResolvedValue(row()),
      findById: asyncMock().mockResolvedValue(row()),
      replace: asyncMock().mockResolvedValue(row()),
      setAdvanced: asyncMock().mockResolvedValue(row()),
      delete: asyncMock(),
      listActive: asyncMock().mockResolvedValue([]),
    },
    accounts: {
      assertUsable: asyncMock(),
      list: asyncMock().mockResolvedValue({ items: [], totalBalance: 445750n }),
    },
    transactions: { record: asyncMock().mockResolvedValue({ id: 100n }) },
    categories: { assertUsable: asyncMock() },
  };
  const service = new ScheduledItemsService(
    mocks.prisma as unknown as PrismaService,
    mocks.items as unknown as ScheduledItemsRepository,
    mocks.accounts as unknown as AccountsService,
    mocks.transactions as unknown as TransactionsService,
    mocks.categories as unknown as CategoriesService,
  );
  return { service, mocks };
}

describe('ScheduledItemsService', () => {
  let service: ScheduledItemsService;
  let mocks: ReturnType<typeof build>['mocks'];

  beforeEach(() => {
    ({ service, mocks } = build());
  });

  it('validates account and category and creates inside one transaction', async () => {
    await service.create(input);
    expect(mocks.prisma.withTransaction).toHaveBeenCalledTimes(1);
    expect(mocks.accounts.assertUsable).toHaveBeenCalledWith(1n, 'accountId', fakeTx);
    expect(mocks.categories.assertUsable).toHaveBeenCalledWith(3n, 'expense', fakeTx);
    expect(mocks.items.create).toHaveBeenCalledWith(input, fakeTx);
  });

  it('checks the income kind against an income category', async () => {
    await service.create({ ...input, kind: 'income' });
    expect(mocks.categories.assertUsable).toHaveBeenCalledWith(3n, 'income', fakeTx);
  });

  it('rejects a past next due date on create but accepts it on update', async () => {
    const past = { ...input, nextDueDate: addDays(today, -3) };
    await expect(service.create(past)).rejects.toBeInstanceOf(DomainRuleViolationError);
    expect(mocks.items.create).not.toHaveBeenCalled();
    await expect(service.update(7n, past)).resolves.toBeTruthy();
    expect(mocks.items.replace).toHaveBeenCalledWith(7n, past, fakeTx);
  });

  it('rejects an end date before the next due date', async () => {
    await expect(
      service.create({ ...input, endDate: addDays(input.nextDueDate, -1) }),
    ).rejects.toBeInstanceOf(DomainRuleViolationError);
  });

  it('404s updates, deletes and confirmations of a missing item', async () => {
    mocks.items.findById.mockResolvedValue(null);
    await expect(service.update(9n, input)).rejects.toBeInstanceOf(NotFoundError);
    await expect(service.remove(9n)).rejects.toBeInstanceOf(NotFoundError);
    await expect(service.confirm(9n, { ...input, date: today })).rejects.toBeInstanceOf(
      NotFoundError,
    );
  });

  it('computes overdue flags from missed periods', async () => {
    mocks.items.listActive.mockResolvedValue([
      row({ nextDueDate: new Date(`${addDays(today, -40)}T00:00:00Z`) }),
      row({ id: 8n, nextDueDate: new Date(`${today}T00:00:00Z`) }),
    ]);
    const views = await service.list();
    expect(views[0].overdue).toBe(true);
    expect(views[0].overdueCount).toBe(2);
    expect(views[1].overdue).toBe(false);
    expect(views[1].overdueCount).toBe(0);
  });

  it('confirms by recording a real transaction and advancing one clamped month, atomically', async () => {
    mocks.items.findById.mockResolvedValue(row({ nextDueDate: new Date('2026-10-31T00:00:00Z') }));
    await service.confirm(7n, {
      amount: 125000n,
      date: today,
      accountId: 1n,
      categoryId: 3n,
      description: 'Rent',
    });
    expect(mocks.transactions.record).toHaveBeenCalledWith(
      {
        kind: 'expense',
        amount: 125000n,
        accountId: 1n,
        categoryId: 3n,
        date: today,
        description: 'Rent',
      },
      fakeTx,
    );
    expect(mocks.items.setAdvanced).toHaveBeenCalledWith(7n, { nextDueDate: '2026-11-30' }, fakeTx);
  });

  it('records an income transaction for income items', async () => {
    mocks.items.findById.mockResolvedValue(row({ kind: 'income' }));
    await service.confirm(7n, {
      amount: 4500n,
      date: today,
      accountId: 1n,
      categoryId: 3n,
      description: 'Dog walking',
    });
    expect(mocks.transactions.record).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'income' }),
      fakeTx,
    );
  });

  it('completes a once item and an item advanced past its end date', async () => {
    mocks.items.findById.mockResolvedValue(row({ recurrence: 'once' }));
    await service.confirm(7n, {
      amount: 80000n,
      date: today,
      accountId: 1n,
      categoryId: 3n,
      description: 'Flight',
    });
    expect(mocks.items.setAdvanced).toHaveBeenCalledWith(7n, { status: 'completed' }, fakeTx);

    mocks.items.findById.mockResolvedValue(row({ endDate: new Date('2026-10-15T00:00:00Z') }));
    await service.confirm(7n, {
      amount: 120000n,
      date: today,
      accountId: 1n,
      categoryId: 3n,
      description: 'Rent',
    });
    expect(mocks.items.setAdvanced).toHaveBeenLastCalledWith(7n, { status: 'completed' }, fakeTx);
  });

  it('rejects confirming an already completed item', async () => {
    mocks.items.findById.mockResolvedValue(row({ status: 'completed' }));
    await expect(
      service.confirm(7n, {
        amount: 1n,
        date: today,
        accountId: 1n,
        categoryId: 3n,
        description: 'x',
      }),
    ).rejects.toBeInstanceOf(DomainRuleViolationError);
    expect(mocks.transactions.record).not.toHaveBeenCalled();
  });

  it('projects from the non-archived total and rejects a horizon past 24 months', async () => {
    mocks.items.listActive.mockResolvedValue([
      row({ nextDueDate: new Date(`${addDays(today, 5)}T00:00:00Z`), recurrence: 'once' }),
    ]);
    const horizon = addMonthsClamped(today, 2);
    const projection = await service.projection(horizon);
    expect(mocks.accounts.list).toHaveBeenCalledWith(false);
    expect(projection.horizon).toBe(horizon);
    expect(projection.startingBalance).toBe(445750n);
    expect(projection.finalBalance).toBe(325750n);

    await expect(
      service.projection(addDays(addMonthsClamped(today, 24), 1)),
    ).rejects.toBeInstanceOf(ValidationFailedError);
  });
});
