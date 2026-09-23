import { describe, expect, it } from 'vitest';
import { TransactionWithEntries } from '../../ledger/services/ledger.service';
import { PaginatedTransactionsDto, TransactionResponseDto } from './transaction-response.dto';

type Entry = TransactionWithEntries['entries'][number];

function entry(partial: Partial<Entry>): Entry {
  return {
    id: 1n,
    transactionId: 100n,
    accountId: null,
    systemAccountId: null,
    amount: 0n,
    systemAccount: null,
    ...partial,
  } as Entry;
}

function row(partial: Partial<TransactionWithEntries>): TransactionWithEntries {
  return {
    id: 100n,
    kind: 'expense',
    date: new Date('2026-09-10T00:00:00Z'),
    description: 'Market',
    projectId: null,
    deletedAt: null,
    entries: [],
    ...partial,
  } as TransactionWithEntries;
}

describe('TransactionResponseDto.from', () => {
  it('reconstructs an expense: positive amount, account, category', () => {
    const dto = TransactionResponseDto.from(
      row({
        entries: [
          entry({ accountId: 1n, amount: -4250n }),
          entry({ systemAccountId: 10n, amount: 4250n, systemAccount: { categoryId: 5n } }),
        ],
      }),
    );
    expect(dto).toEqual({
      id: '100',
      kind: 'expense',
      date: '2026-09-10',
      description: 'Market',
      amount: '4250',
      accountId: '1',
      categoryId: '5',
    });
  });

  it('reconstructs an income as a positive amount into the account', () => {
    const dto = TransactionResponseDto.from(
      row({
        kind: 'income',
        entries: [
          entry({ accountId: 1n, amount: 300000n }),
          entry({ systemAccountId: 11n, amount: -300000n, systemAccount: { categoryId: 10n } }),
        ],
      }),
    );
    expect(dto.amount).toBe('300000');
    expect(dto.accountId).toBe('1');
    expect(dto.categoryId).toBe('10');
    expect(dto.counterAccountId).toBeUndefined();
  });

  it('reconstructs a transfer with source and destination, no category', () => {
    const dto = TransactionResponseDto.from(
      row({
        kind: 'transfer',
        entries: [
          entry({ accountId: 2n, amount: 50000n }),
          entry({ accountId: 1n, amount: -50000n }),
        ],
      }),
    );
    expect(dto.amount).toBe('50000');
    expect(dto.accountId).toBe('1');
    expect(dto.counterAccountId).toBe('2');
    expect(dto.categoryId).toBeUndefined();
  });

  it('keeps an opening amount signed and exact at the guard limit', () => {
    const limit = 10n ** 15n;
    const dto = TransactionResponseDto.from(
      row({
        kind: 'opening',
        entries: [
          entry({ accountId: 3n, amount: -limit }),
          entry({ systemAccountId: 1n, amount: limit }),
        ],
      }),
    );
    expect(dto.amount).toBe('-1000000000000000');
    expect(dto.accountId).toBe('3');
  });

  it('carries the project id only when the expense is tagged', () => {
    const tagged = TransactionResponseDto.from(
      row({
        projectId: 9n,
        entries: [
          entry({ accountId: 1n, amount: -100n }),
          entry({ systemAccountId: 10n, amount: 100n, systemAccount: { categoryId: 5n } }),
        ],
      }),
    );
    expect(tagged.projectId).toBe('9');
  });
});

describe('PaginatedTransactionsDto.from', () => {
  it('carries items, total, limit and offset', () => {
    const page = PaginatedTransactionsDto.from({
      items: [
        row({
          entries: [
            entry({ accountId: 1n, amount: -100n }),
            entry({ systemAccountId: 10n, amount: 100n, systemAccount: { categoryId: 5n } }),
          ],
        }),
      ],
      total: 87,
      limit: 50,
      offset: 0,
    });
    expect(page.items).toHaveLength(1);
    expect(page.total).toBe(87);
    expect(page.limit).toBe(50);
    expect(page.offset).toBe(0);
  });
});
