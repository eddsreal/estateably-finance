import { describe, expect, it } from 'vitest';
import { TransactionWithEntries } from '../../ledger/services/ledger.service';
import { MonthlyReportResponseDto, ReportTransactionDto } from './monthly-report-response.dto';

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

function expenseRow(partial: Partial<TransactionWithEntries> = {}): TransactionWithEntries {
  return {
    id: 100n,
    kind: 'expense',
    date: new Date('2026-09-10T00:00:00Z'),
    description: 'Market',
    projectId: null,
    deletedAt: null,
    entries: [
      entry({ accountId: 1n, amount: -4250n }),
      entry({ systemAccountId: 10n, amount: 4250n, systemAccount: { categoryId: 5n } }),
    ],
    ...partial,
  } as TransactionWithEntries;
}

describe('ReportTransactionDto.from', () => {
  it('maps an expense to the contract shape with a positive string amount', () => {
    expect(ReportTransactionDto.from(expenseRow())).toEqual({
      id: '100',
      kind: 'expense',
      date: '2026-09-10',
      description: 'Market',
      amount: '4250',
      accountId: '1',
      categoryId: '5',
    });
  });

  it('stays exact at the ±10^15 guard limit', () => {
    const limit = 10n ** 15n;
    const dto = ReportTransactionDto.from(
      expenseRow({
        entries: [
          entry({ accountId: 1n, amount: -limit }),
          entry({ systemAccountId: 10n, amount: limit, systemAccount: { categoryId: 5n } }),
        ],
      }),
    );
    expect(dto.amount).toBe('1000000000000000');
  });

  it('carries the project id only when the expense is tagged', () => {
    expect(ReportTransactionDto.from(expenseRow({ projectId: 9n })).projectId).toBe('9');
    expect(ReportTransactionDto.from(expenseRow()).projectId).toBeUndefined();
  });
});

describe('MonthlyReportResponseDto.from', () => {
  it('serialises bigint totals as strings across all categories', () => {
    const limit = 10n ** 15n;
    const dto = MonthlyReportResponseDto.from({
      month: '2026-09',
      grandTotal: limit,
      categories: [
        { categoryId: 6n, categoryName: 'Rent', total: limit, transactions: [expenseRow()] },
      ],
    });
    expect(dto).toEqual({
      month: '2026-09',
      grandTotal: '1000000000000000',
      categories: [
        {
          categoryId: '6',
          categoryName: 'Rent',
          total: '1000000000000000',
          transactions: [ReportTransactionDto.from(expenseRow())],
        },
      ],
    });
  });

  it('serialises an empty month as "0" and no categories', () => {
    expect(
      MonthlyReportResponseDto.from({ month: '2026-08', grandTotal: 0n, categories: [] }),
    ).toEqual({ month: '2026-08', grandTotal: '0', categories: [] });
  });
});
