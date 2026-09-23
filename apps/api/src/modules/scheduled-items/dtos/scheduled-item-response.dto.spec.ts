import { describe, expect, it } from 'vitest';
import { TransactionWithEntries } from '../../ledger/services/ledger.service';
import { ScheduledItemWithAccount } from '../repositories/scheduled-items.repository';
import {
  ConfirmScheduledItemResponseDto,
  ProjectionResponseDto,
  ScheduledItemResponseDto,
} from './scheduled-item-response.dto';

const LIMIT = 10n ** 15n;

function row(overrides: Partial<ScheduledItemWithAccount> = {}): ScheduledItemWithAccount {
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
  } as ScheduledItemWithAccount;
}

describe('ScheduledItemResponseDto', () => {
  it('serialises ids and cents as strings and dates as date-only', () => {
    const dto = ScheduledItemResponseDto.from({ row: row(), overdue: false, overdueCount: 0 });
    expect(dto).toEqual({
      id: '7',
      kind: 'bill',
      description: 'Rent',
      amount: '120000',
      accountId: '1',
      categoryId: '3',
      nextDueDate: '2026-10-01',
      recurrence: 'monthly',
      status: 'active',
      overdue: false,
      overdueCount: 0,
      accountArchived: false,
    });
    expect(dto.endDate).toBeUndefined();
  });

  it('carries the guard-limit amount, the end date and the flags', () => {
    const dto = ScheduledItemResponseDto.from({
      row: row({
        amount: LIMIT,
        endDate: new Date('2027-01-31T00:00:00Z'),
        account: { archived: true },
      }),
      overdue: true,
      overdueCount: 2,
    });
    expect(dto.amount).toBe('1000000000000000');
    expect(dto.endDate).toBe('2027-01-31');
    expect(dto.overdue).toBe(true);
    expect(dto.overdueCount).toBe(2);
    expect(dto.accountArchived).toBe(true);
  });
});

describe('ConfirmScheduledItemResponseDto', () => {
  it('reconstructs the recorded expense from its entries', () => {
    const transaction = {
      id: 100n,
      kind: 'expense',
      date: new Date('2026-10-03T00:00:00Z'),
      description: 'Rent',
      projectId: null,
      deletedAt: null,
      entries: [
        { accountId: 1n, systemAccountId: null, amount: -125000n, systemAccount: null },
        {
          accountId: null,
          systemAccountId: 9n,
          amount: 125000n,
          systemAccount: { categoryId: 3n },
        },
      ],
    } as unknown as TransactionWithEntries;
    const dto = ConfirmScheduledItemResponseDto.from({
      transaction,
      item: { row: row(), overdue: false, overdueCount: 0 },
    });
    expect(dto.transaction).toEqual({
      id: '100',
      kind: 'expense',
      date: '2026-10-03',
      description: 'Rent',
      amount: '125000',
      accountId: '1',
      categoryId: '3',
    });
    expect(dto.item.id).toBe('7');
  });
});

describe('ProjectionResponseDto', () => {
  it('serialises signed running balances at the guard limits', () => {
    const dto = ProjectionResponseDto.from({
      horizon: '2026-10-31',
      startingBalance: -LIMIT,
      finalBalance: LIMIT,
      occurrences: [
        {
          date: '2026-10-01',
          scheduledItemId: 7n,
          description: 'Rent',
          kind: 'bill',
          amount: 120000n,
          runningBalance: -120000n,
          overdue: true,
        },
      ],
    });
    expect(dto.startingBalance).toBe('-1000000000000000');
    expect(dto.finalBalance).toBe('1000000000000000');
    expect(dto.occurrences).toEqual([
      {
        date: '2026-10-01',
        scheduledItemId: '7',
        description: 'Rent',
        kind: 'bill',
        amount: '120000',
        runningBalance: '-120000',
        overdue: true,
      },
    ]);
  });
});
