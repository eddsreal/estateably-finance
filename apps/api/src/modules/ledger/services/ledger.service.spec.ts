import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NotFoundError, OpeningKindChangeError } from '../../../common/domain-errors/domain-errors';
import { PrismaService, TransactionClient } from '../../../common/prisma.service/prisma.service';
import { BalanceSnapshotsRepository } from '../repositories/balance-snapshots.repository';
import { EntriesRepository } from '../repositories/entries.repository';
import { SystemAccountsRepository } from '../repositories/system-accounts.repository';
import { TransactionsRepository } from '../repositories/transactions.repository';
import { LedgerService } from './ledger.service';

const fakeTx = { fake: true } as unknown as TransactionClient;

type Mocks = {
  prisma: { withTransaction: ReturnType<typeof vi.fn> };
  transactions: {
    create: ReturnType<typeof vi.fn>;
    findLiveById: ReturnType<typeof vi.fn>;
    findOpeningByAccount: ReturnType<typeof vi.fn>;
    replaceIntent: ReturnType<typeof vi.fn>;
    softDelete: ReturnType<typeof vi.fn>;
    list: ReturnType<typeof vi.fn>;
  };
  entries: {
    deleteByTransaction: ReturnType<typeof vi.fn>;
    existsForCategory: ReturnType<typeof vi.fn>;
    listForAccount: ReturnType<typeof vi.fn>;
  };
  systemAccounts: {
    findEquity: ReturnType<typeof vi.fn>;
    findByCategoryId: ReturnType<typeof vi.fn>;
    createForCategory: ReturnType<typeof vi.fn>;
  };
  snapshots: { applyDelta: ReturnType<typeof vi.fn>; get: ReturnType<typeof vi.fn> };
};

function build(): { service: LedgerService; mocks: Mocks } {
  const asyncMock = () => vi.fn<(...args: unknown[]) => Promise<unknown>>();
  const mocks: Mocks = {
    prisma: {
      withTransaction: vi.fn<(fn: (tx: TransactionClient) => Promise<unknown>) => Promise<unknown>>(
        (fn) => fn(fakeTx),
      ),
    },
    transactions: {
      create: asyncMock().mockResolvedValue({ id: 100n, entries: [] }),
      findLiveById: asyncMock(),
      findOpeningByAccount: asyncMock().mockResolvedValue(null),
      replaceIntent: asyncMock().mockResolvedValue({ id: 100n, entries: [] }),
      softDelete: asyncMock(),
      list: asyncMock().mockResolvedValue({ items: [], total: 0 }),
    },
    entries: {
      deleteByTransaction: asyncMock(),
      existsForCategory: asyncMock().mockResolvedValue(false),
      listForAccount: asyncMock().mockResolvedValue([]),
    },
    systemAccounts: {
      findEquity: asyncMock().mockResolvedValue({ id: 1n, kind: 'equity', categoryId: null }),
      findByCategoryId: asyncMock().mockResolvedValue({
        id: 10n,
        kind: 'category',
        categoryId: 5n,
      }),
      createForCategory: asyncMock(),
    },
    snapshots: { applyDelta: asyncMock(), get: asyncMock().mockResolvedValue(null) },
  };
  const service = new LedgerService(
    mocks.prisma as unknown as PrismaService,
    mocks.transactions as unknown as TransactionsRepository,
    mocks.entries as unknown as EntriesRepository,
    mocks.systemAccounts as unknown as SystemAccountsRepository,
    mocks.snapshots as unknown as BalanceSnapshotsRepository,
  );
  return { service, mocks };
}

describe('LedgerService', () => {
  let service: LedgerService;
  let mocks: Mocks;

  beforeEach(() => {
    ({ service, mocks } = build());
  });

  it('records an expense as two balanced entries and applies the snapshot delta', async () => {
    await service.record({
      kind: 'expense',
      amount: 4250n,
      accountId: 1n,
      categoryId: 5n,
      date: '2026-09-10',
      description: 'Market',
    });
    expect(mocks.transactions.create).toHaveBeenCalledWith(
      { kind: 'expense', date: '2026-09-10', description: 'Market', projectId: undefined },
      [
        { accountId: 1n, systemAccountId: null, amount: -4250n },
        { accountId: null, systemAccountId: 10n, amount: 4250n },
      ],
      fakeTx,
    );
    expect(mocks.snapshots.applyDelta).toHaveBeenCalledTimes(1);
    expect(mocks.snapshots.applyDelta).toHaveBeenCalledWith(1n, -4250n, fakeTx);
  });

  it('records an opening against the equity system account', async () => {
    await service.record({
      kind: 'opening',
      amount: -50000n,
      accountId: 3n,
      date: '2026-09-01',
      description: 'Opening balance',
    });
    expect(mocks.systemAccounts.findEquity).toHaveBeenCalled();
    expect(mocks.snapshots.applyDelta).toHaveBeenCalledWith(3n, -50000n, fakeTx);
  });

  it('updates both accounts of a transfer', async () => {
    await service.record({
      kind: 'transfer',
      amount: 50000n,
      accountId: 1n,
      counterAccountId: 2n,
      date: '2026-09-12',
      description: 'To savings',
    });
    expect(mocks.snapshots.applyDelta).toHaveBeenCalledWith(1n, -50000n, fakeTx);
    expect(mocks.snapshots.applyDelta).toHaveBeenCalledWith(2n, 50000n, fakeTx);
  });

  it('runs inside a passed transaction client without opening its own', async () => {
    const outerTx = { outer: true } as unknown as TransactionClient;
    await service.record(
      {
        kind: 'transfer',
        amount: 1n,
        accountId: 1n,
        counterAccountId: 2n,
        date: '2026-09-12',
        description: 'x',
      },
      outerTx,
    );
    expect(mocks.prisma.withTransaction).not.toHaveBeenCalled();
    expect(mocks.snapshots.applyDelta).toHaveBeenCalledWith(1n, -1n, outerTx);
  });

  it('regenerates entries on edit, reversing the old snapshot deltas first', async () => {
    mocks.transactions.findLiveById.mockResolvedValue({
      id: 100n,
      kind: 'expense',
      entries: [
        { accountId: 1n, systemAccountId: null, amount: -4250n },
        { accountId: null, systemAccountId: 10n, amount: 4250n },
      ],
    });
    await service.update(100n, {
      kind: 'transfer',
      amount: 700n,
      accountId: 1n,
      counterAccountId: 2n,
      date: '2026-09-13',
      description: 'Actually a transfer',
    });
    expect(mocks.snapshots.applyDelta).toHaveBeenNthCalledWith(1, 1n, 4250n, fakeTx);
    expect(mocks.entries.deleteByTransaction).toHaveBeenCalledWith(100n, fakeTx);
    expect(mocks.transactions.replaceIntent).toHaveBeenCalledWith(
      100n,
      {
        kind: 'transfer',
        date: '2026-09-13',
        description: 'Actually a transfer',
        projectId: undefined,
      },
      [
        { accountId: 1n, systemAccountId: null, amount: -700n },
        { accountId: 2n, systemAccountId: null, amount: 700n },
      ],
      fakeTx,
    );
    expect(mocks.snapshots.applyDelta).toHaveBeenNthCalledWith(2, 1n, -700n, fakeTx);
    expect(mocks.snapshots.applyDelta).toHaveBeenNthCalledWith(3, 2n, 700n, fakeTx);
  });

  it('rejects an edit of a missing or soft-deleted transaction', async () => {
    mocks.transactions.findLiveById.mockResolvedValue(null);
    await expect(
      service.update(99n, {
        kind: 'expense',
        amount: 1n,
        accountId: 1n,
        categoryId: 5n,
        date: '2026-09-13',
        description: 'x',
      }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it('never lets opening interchange with the other kinds', async () => {
    mocks.transactions.findLiveById.mockResolvedValue({ id: 100n, kind: 'opening', entries: [] });
    const edit = {
      kind: 'expense' as const,
      amount: 1n,
      accountId: 1n,
      categoryId: 5n,
      date: '2026-09-13',
      description: 'x',
    };
    await expect(service.update(100n, edit)).rejects.toBeInstanceOf(OpeningKindChangeError);

    mocks.transactions.findLiveById.mockResolvedValue({ id: 101n, kind: 'expense', entries: [] });
    await expect(
      service.update(101n, {
        kind: 'opening',
        amount: 1n,
        accountId: 1n,
        date: '2026-09-13',
        description: 'x',
      }),
    ).rejects.toBeInstanceOf(OpeningKindChangeError);
  });

  it('soft-deletes by reversing the account deltas and marking the row', async () => {
    mocks.transactions.findLiveById.mockResolvedValue({
      id: 100n,
      kind: 'transfer',
      entries: [
        { accountId: 1n, systemAccountId: null, amount: -50000n },
        { accountId: 2n, systemAccountId: null, amount: 50000n },
      ],
    });
    await service.softDelete(100n);
    expect(mocks.transactions.softDelete).toHaveBeenCalledWith(100n, fakeTx);
    expect(mocks.snapshots.applyDelta).toHaveBeenCalledWith(1n, 50000n, fakeTx);
    expect(mocks.snapshots.applyDelta).toHaveBeenCalledWith(2n, -50000n, fakeTx);
  });

  it('lists with the default page of 50 from offset 0 and carries the total', async () => {
    mocks.transactions.list.mockResolvedValue({ items: [], total: 87 });
    const page = await service.list({});
    expect(mocks.transactions.list).toHaveBeenCalledWith({}, 50, 0);
    expect(page).toEqual({ items: [], total: 87, limit: 50, offset: 0 });
  });

  it('answers a zero current balance when no snapshot row exists', async () => {
    expect(await service.currentBalance(42n)).toBe(0n);
    mocks.snapshots.get.mockResolvedValue(445750n);
    expect(await service.currentBalance(1n)).toBe(445750n);
  });

  it('exposes the live opening transaction and category usage as reads', async () => {
    const opening = { id: 7n, kind: 'opening', entries: [] };
    mocks.transactions.findOpeningByAccount.mockResolvedValue(opening);
    expect(await service.findOpening(3n)).toBe(opening);
    expect(mocks.transactions.findOpeningByAccount).toHaveBeenCalledWith(3n, undefined);

    mocks.entries.existsForCategory.mockResolvedValue(true);
    expect(await service.hasEntriesForCategory(5n)).toBe(true);
    expect(mocks.entries.existsForCategory).toHaveBeenCalledWith(5n, undefined);
  });

  it('computes balanceAsOf from entries, not from the snapshot', async () => {
    mocks.entries.listForAccount.mockResolvedValue([
      { date: '2026-09-01', amount: 150000n },
      { date: '2026-09-12', amount: 300000n },
    ]);
    expect(await service.balanceAsOf(1n, '2026-09-10')).toBe(150000n);
    expect(mocks.snapshots.get).not.toHaveBeenCalled();
  });
});
