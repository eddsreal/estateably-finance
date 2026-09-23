import { describe, expect, it } from 'vitest';
import { TransactionWithEntries } from '../../ledger/services/ledger.service';
import { ReportTransactionDto } from './monthly-report-response.dto';
import { SimilarReportResponseDto } from './similar-report-response.dto';

function expenseRow(id: bigint, amount: bigint): TransactionWithEntries {
  return {
    id,
    kind: 'expense',
    date: new Date('2026-09-05T00:00:00Z'),
    description: 'Uber 1234',
    projectId: null,
    deletedAt: null,
    entries: [
      { accountId: 1n, systemAccountId: null, amount: -amount, systemAccount: null },
      { accountId: null, systemAccountId: 10n, amount, systemAccount: { categoryId: 5n } },
    ],
  } as unknown as TransactionWithEntries;
}

describe('SimilarReportResponseDto.from', () => {
  it('serialises group totals as strings, exact at the ±10^15 guard limit', () => {
    const limit = 10n ** 15n;
    const row = expenseRow(7n, limit);
    const dto = SimilarReportResponseDto.from({
      from: '2026-09-01',
      to: '2026-09-30',
      groups: [{ key: 'uber', count: 1, total: limit, transactions: [row] }],
      topTransactions: [row],
      topGroupKey: 'uber',
    });
    expect(dto).toEqual({
      from: '2026-09-01',
      to: '2026-09-30',
      groups: [
        {
          key: 'uber',
          count: 1,
          total: '1000000000000000',
          transactions: [ReportTransactionDto.from(row)],
        },
      ],
      topTransactions: [ReportTransactionDto.from(row)],
      topGroupKey: 'uber',
    });
    expect(dto.topTransactions[0].amount).toBe('1000000000000000');
  });

  it('serialises an empty report with a null top group', () => {
    expect(
      SimilarReportResponseDto.from({
        from: '2026-08-01',
        to: '2026-08-31',
        groups: [],
        topTransactions: [],
        topGroupKey: null,
      }),
    ).toEqual({
      from: '2026-08-01',
      to: '2026-08-31',
      groups: [],
      topTransactions: [],
      topGroupKey: null,
    });
  });
});
