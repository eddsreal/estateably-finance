import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  DuplicateNameError,
  NotFoundError,
  ValidationFailedError,
} from '../../../common/domain-errors/domain-errors';
import { PrismaService, TransactionClient } from '../../../common/prisma.service/prisma.service';
import { LedgerService } from '../../ledger/services/ledger.service';
import { AccountsRepository } from '../repositories/accounts.repository';
import { AccountsService } from './accounts.service';

const fakeTx = { fake: true } as unknown as TransactionClient;

function openingRow(amount: bigint, date: string) {
  return {
    id: 900n,
    kind: 'opening',
    date: new Date(`${date}T00:00:00Z`),
    description: 'Opening balance',
    entries: [
      { accountId: 1n, systemAccountId: null, amount },
      { accountId: null, systemAccountId: 1n, amount: -amount },
    ],
  };
}

function build() {
  const asyncMock = () => vi.fn<(...args: unknown[]) => Promise<unknown>>();
  const mocks = {
    prisma: {
      withTransaction: vi.fn<(fn: (tx: TransactionClient) => Promise<unknown>) => Promise<unknown>>(
        (fn) => fn(fakeTx),
      ),
    },
    accounts: {
      create: asyncMock(),
      findById: asyncMock(),
      update: asyncMock(),
      setArchived: asyncMock(),
      list: asyncMock().mockResolvedValue([]),
    },
    ledger: {
      record: asyncMock(),
      update: asyncMock(),
      softDelete: asyncMock(),
      findOpening: asyncMock().mockResolvedValue(null),
      currentBalance: asyncMock().mockResolvedValue(0n),
    },
  };
  const service = new AccountsService(
    mocks.prisma as unknown as PrismaService,
    mocks.accounts as unknown as AccountsRepository,
    mocks.ledger as unknown as LedgerService,
  );
  return { service, mocks };
}

describe('AccountsService', () => {
  let service: AccountsService;
  let mocks: ReturnType<typeof build>['mocks'];

  beforeEach(() => {
    ({ service, mocks } = build());
  });

  it('creates an account with a non-zero signed opening balance through the ledger, atomically', async () => {
    mocks.accounts.create.mockResolvedValue({ id: 1n, name: 'Visa', kind: 'card' });
    const view = await service.create({
      name: 'Visa',
      kind: 'card',
      openingBalance: -50000n,
      openingDate: '2026-09-01',
    });
    expect(mocks.ledger.record).toHaveBeenCalledWith(
      {
        kind: 'opening',
        amount: -50000n,
        accountId: 1n,
        date: '2026-09-01',
        description: 'Opening balance',
      },
      fakeTx,
    );
    expect(view.balance).toBe(-50000n);
  });

  it('records no opening transaction for a zero opening balance', async () => {
    mocks.accounts.create.mockResolvedValue({ id: 2n, name: 'Savings', kind: 'bank' });
    await service.create({
      name: 'Savings',
      kind: 'bank',
      openingBalance: 0n,
      openingDate: '2026-09-01',
    });
    expect(mocks.ledger.record).not.toHaveBeenCalled();
  });

  it('maps the unique-name index violation to DUPLICATE_NAME', async () => {
    mocks.accounts.create.mockRejectedValue(
      new Error('duplicate key value violates unique constraint "accounts_name_unique"'),
    );
    await expect(
      service.create({
        name: 'Checking',
        kind: 'bank',
        openingBalance: 0n,
        openingDate: '2026-09-01',
      }),
    ).rejects.toBeInstanceOf(DuplicateNameError);
  });

  it('creates the opening transaction when an edit moves the balance from zero to non-zero', async () => {
    mocks.accounts.findById.mockResolvedValue({ id: 1n, name: 'Cash' });
    mocks.accounts.update.mockResolvedValue({
      id: 1n,
      openingDate: new Date('2026-09-01T00:00:00Z'),
    });
    await service.update(1n, { openingBalance: 30000n });
    expect(mocks.ledger.record).toHaveBeenCalledWith(
      {
        kind: 'opening',
        amount: 30000n,
        accountId: 1n,
        date: '2026-09-01',
        description: 'Opening balance',
      },
      fakeTx,
    );
  });

  it('soft-deletes the opening transaction when an edit moves the balance to zero', async () => {
    mocks.accounts.findById.mockResolvedValue({ id: 1n, name: 'Checking' });
    mocks.accounts.update.mockResolvedValue({
      id: 1n,
      openingDate: new Date('2026-09-01T00:00:00Z'),
    });
    mocks.ledger.findOpening.mockResolvedValue(openingRow(150000n, '2026-09-01'));
    await service.update(1n, { openingBalance: 0n });
    expect(mocks.ledger.softDelete).toHaveBeenCalledWith(900n, fakeTx);
    expect(mocks.ledger.update).not.toHaveBeenCalled();
  });

  it('rebalances the opening transaction on amount or date changes', async () => {
    mocks.accounts.findById.mockResolvedValue({ id: 1n, name: 'Checking' });
    mocks.accounts.update.mockResolvedValue({
      id: 1n,
      openingDate: new Date('2026-09-02T00:00:00Z'),
    });
    mocks.ledger.findOpening.mockResolvedValue(openingRow(150000n, '2026-09-01'));
    await service.update(1n, { openingDate: '2026-09-02' });
    expect(mocks.ledger.update).toHaveBeenCalledWith(
      900n,
      {
        kind: 'opening',
        amount: 150000n,
        accountId: 1n,
        date: '2026-09-02',
        description: 'Opening balance',
      },
      fakeTx,
    );
  });

  it('leaves the ledger untouched when only the name changes', async () => {
    mocks.accounts.findById.mockResolvedValue({ id: 1n, name: 'Checking' });
    mocks.accounts.update.mockResolvedValue({
      id: 1n,
      openingDate: new Date('2026-09-01T00:00:00Z'),
    });
    mocks.ledger.findOpening.mockResolvedValue(openingRow(150000n, '2026-09-01'));
    await service.update(1n, { name: 'Everyday Checking' });
    expect(mocks.ledger.record).not.toHaveBeenCalled();
    expect(mocks.ledger.update).not.toHaveBeenCalled();
    expect(mocks.ledger.softDelete).not.toHaveBeenCalled();
  });

  it('rejects an empty patch and a missing account', async () => {
    mocks.accounts.findById.mockResolvedValue({ id: 1n });
    await expect(service.update(1n, {})).rejects.toBeInstanceOf(ValidationFailedError);
    mocks.accounts.findById.mockResolvedValue(null);
    await expect(service.update(9n, { name: 'x' })).rejects.toBeInstanceOf(NotFoundError);
    await expect(service.setArchived(9n, true)).rejects.toBeInstanceOf(NotFoundError);
  });

  it('archives and unarchives symmetrically without touching transactions', async () => {
    mocks.accounts.findById.mockResolvedValue({ id: 1n, archived: false });
    mocks.accounts.setArchived.mockResolvedValue({ id: 1n, archived: true });
    await service.setArchived(1n, true);
    expect(mocks.accounts.setArchived).toHaveBeenCalledWith(1n, true);
    await service.setArchived(1n, false);
    expect(mocks.accounts.setArchived).toHaveBeenCalledWith(1n, false);
    expect(mocks.ledger.record).not.toHaveBeenCalled();
  });

  it('sums the total across non-archived accounts only', async () => {
    mocks.accounts.list.mockResolvedValue([
      { id: 1n, archived: false },
      { id: 2n, archived: true },
      { id: 3n, archived: false },
    ]);
    mocks.ledger.currentBalance.mockImplementation((id: unknown) =>
      Promise.resolve(id === 1n ? 100n : id === 2n ? 900n : 23n),
    );
    const { items, totalBalance } = await service.list(true);
    expect(items).toHaveLength(3);
    expect(totalBalance).toBe(123n);
  });
});
