import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ArchivedAccountError,
  DateRangeError,
  DomainRuleViolationError,
  FutureDateError,
  NotFoundError,
  SameAccountTransferError,
} from '../../../common/domain-errors/domain-errors';
import { PrismaService, TransactionClient } from '../../../common/prisma.service/prisma.service';
import { CategoriesService } from '../../categories/services/categories.service';
import { LedgerService } from '../../ledger/services/ledger.service';
import { ProjectsService } from '../../projects/services/projects.service';
import { AccountsRepository } from '../repositories/accounts.repository';
import { TransactionsService, UserTransactionInput } from './transactions.service';

const fakeTx = { fake: true } as unknown as TransactionClient;

const expense: UserTransactionInput = {
  kind: 'expense',
  amount: 4250n,
  accountId: 1n,
  categoryId: 5n,
  date: '2026-09-10',
  description: 'Market',
};

function build() {
  const asyncMock = () => vi.fn<(...args: unknown[]) => Promise<unknown>>();
  const mocks = {
    prisma: {
      withTransaction: vi.fn<(fn: (tx: TransactionClient) => Promise<unknown>) => Promise<unknown>>(
        (fn) => fn(fakeTx),
      ),
    },
    accounts: {
      findById: asyncMock().mockResolvedValue({ id: 1n, archived: false }),
    },
    categories: { assertUsable: asyncMock() },
    projects: { assertActive: asyncMock() },
    ledger: {
      record: asyncMock().mockResolvedValue({ id: 100n }),
      update: asyncMock().mockResolvedValue({ id: 100n }),
      softDelete: asyncMock(),
      findLive: asyncMock(),
      list: asyncMock().mockResolvedValue({ items: [], total: 0, limit: 50, offset: 0 }),
    },
  };
  const service = new TransactionsService(
    mocks.prisma as unknown as PrismaService,
    mocks.accounts as unknown as AccountsRepository,
    mocks.categories as unknown as CategoriesService,
    mocks.projects as unknown as ProjectsService,
    mocks.ledger as unknown as LedgerService,
  );
  return { service, mocks };
}

describe('TransactionsService', () => {
  let service: TransactionsService;
  let mocks: ReturnType<typeof build>['mocks'];

  beforeEach(() => {
    ({ service, mocks } = build());
  });

  it('validates then records through the ledger inside one transaction', async () => {
    await service.record(expense);
    expect(mocks.prisma.withTransaction).toHaveBeenCalledTimes(1);
    expect(mocks.categories.assertUsable).toHaveBeenCalledWith(5n, 'expense', fakeTx);
    expect(mocks.ledger.record).toHaveBeenCalledWith(expense, fakeTx);
  });

  it('rejects a future date before touching the ledger', async () => {
    await expect(service.record({ ...expense, date: '2999-01-01' })).rejects.toBeInstanceOf(
      FutureDateError,
    );
    expect(mocks.ledger.record).not.toHaveBeenCalled();
  });

  it('rejects a missing account as a domain rule violation and an archived one explicitly', async () => {
    mocks.accounts.findById.mockResolvedValue(null);
    await expect(service.record(expense)).rejects.toBeInstanceOf(DomainRuleViolationError);
    mocks.accounts.findById.mockResolvedValue({ id: 1n, archived: true });
    await expect(service.record(expense)).rejects.toBeInstanceOf(ArchivedAccountError);
  });

  it('rejects a same-account transfer before any lookup of the destination', async () => {
    await expect(
      service.record({
        kind: 'transfer',
        amount: 100n,
        accountId: 1n,
        counterAccountId: 1n,
        date: '2026-09-10',
        description: 'Loop',
      }),
    ).rejects.toBeInstanceOf(SameAccountTransferError);
  });

  it('checks the transfer destination account', async () => {
    mocks.accounts.findById.mockImplementation((id: unknown) =>
      Promise.resolve(id === 1n ? { id: 1n, archived: false } : { id: 2n, archived: true }),
    );
    await expect(
      service.record({
        kind: 'transfer',
        amount: 100n,
        accountId: 1n,
        counterAccountId: 2n,
        date: '2026-09-10',
        description: 'To savings',
      }),
    ).rejects.toBeInstanceOf(ArchivedAccountError);
  });

  it('delegates the project check only when an expense carries a project', async () => {
    await service.record({ ...expense, projectId: 9n });
    expect(mocks.projects.assertActive).toHaveBeenCalledWith(9n, fakeTx);
    mocks.projects.assertActive.mockClear();
    await service.record(expense);
    expect(mocks.projects.assertActive).not.toHaveBeenCalled();
  });

  it('delegates the income category type check', async () => {
    await service.record({
      kind: 'income',
      amount: 300000n,
      accountId: 1n,
      categoryId: 10n,
      date: '2026-09-15',
      description: 'September salary',
    });
    expect(mocks.categories.assertUsable).toHaveBeenCalledWith(10n, 'income', fakeTx);
  });

  it('updates with the full validation of a new transaction', async () => {
    await service.update(100n, expense);
    expect(mocks.categories.assertUsable).toHaveBeenCalledWith(5n, 'expense', fakeTx);
    expect(mocks.ledger.update).toHaveBeenCalledWith(100n, expense, fakeTx);
  });

  it('soft-deletes a live transaction and 404s a missing one', async () => {
    mocks.ledger.findLive.mockResolvedValue({ id: 100n, kind: 'expense' });
    await service.remove(100n);
    expect(mocks.ledger.softDelete).toHaveBeenCalledWith(100n);
    mocks.ledger.findLive.mockResolvedValue(null);
    await expect(service.remove(101n)).rejects.toBeInstanceOf(NotFoundError);
  });

  it('refuses to delete an opening transaction here', async () => {
    mocks.ledger.findLive.mockResolvedValue({ id: 100n, kind: 'opening' });
    await expect(service.remove(100n)).rejects.toBeInstanceOf(DomainRuleViolationError);
    expect(mocks.ledger.softDelete).not.toHaveBeenCalled();
  });

  it('bounds the list date range: ordered and at most 24 months', async () => {
    await expect(service.list({ from: '2026-09-10', to: '2026-09-01' })).rejects.toBeInstanceOf(
      DateRangeError,
    );
    await expect(service.list({ from: '2024-01-01', to: '2026-02-01' })).rejects.toBeInstanceOf(
      DateRangeError,
    );
    await service.list({ from: '2026-09-01', to: '2026-09-30', limit: 50, offset: 0 });
    expect(mocks.ledger.list).toHaveBeenCalledWith({
      from: '2026-09-01',
      to: '2026-09-30',
      limit: 50,
      offset: 0,
    });
  });

  it('passes the search text through to the ledger unchanged, combined with the other filters', async () => {
    await service.list({ q: 'uber', accountId: 1n, limit: 8 });
    expect(mocks.ledger.list).toHaveBeenCalledWith({ q: 'uber', accountId: 1n, limit: 8 });
  });
});
