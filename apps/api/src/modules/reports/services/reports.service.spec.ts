import { describe, expect, it, vi } from 'vitest';
import { DateRangeError } from '../../../common/domain-errors/domain-errors';
import { CategoriesService } from '../../categories/services/categories.service';
import { LedgerService, TransactionWithEntries } from '../../ledger/services/ledger.service';
import { ReportsService } from './reports.service';

function expenseRow(id: bigint, categoryId: bigint, amount: bigint): TransactionWithEntries {
  return {
    id,
    kind: 'expense',
    date: new Date('2026-09-10T00:00:00Z'),
    description: `Expense ${id}`,
    projectId: null,
    deletedAt: null,
    entries: [
      { accountId: 1n, systemAccountId: null, amount: -amount, systemAccount: null },
      { accountId: null, systemAccountId: 10n, amount, systemAccount: { categoryId } },
    ],
  } as unknown as TransactionWithEntries;
}

function build(rows: TransactionWithEntries[]) {
  const ledger = {
    listAll: vi.fn<() => Promise<TransactionWithEntries[]>>().mockResolvedValue(rows),
  };
  const categories = {
    list: vi.fn<() => Promise<{ id: bigint; name: string }[]>>().mockResolvedValue([
      { id: 5n, name: 'Groceries' },
      { id: 6n, name: 'Rent' },
    ]),
  };
  const service = new ReportsService(
    ledger as unknown as LedgerService,
    categories as unknown as CategoriesService,
  );
  return { service, ledger, categories };
}

describe('ReportsService.monthly', () => {
  it('reads only expenses within the month, archived categories included in the name map', async () => {
    const { service, ledger, categories } = build([]);
    await service.monthly('2026-09');
    expect(ledger.listAll).toHaveBeenCalledWith({
      kind: 'expense',
      from: '2026-09-01',
      to: '2026-09-30',
    });
    expect(categories.list).toHaveBeenCalledWith(true);
  });

  it('bounds February correctly, leap years included', async () => {
    const { service, ledger } = build([]);
    await service.monthly('2026-02');
    expect(ledger.listAll).toHaveBeenLastCalledWith(expect.objectContaining({ to: '2026-02-28' }));
    await service.monthly('2024-02');
    expect(ledger.listAll).toHaveBeenLastCalledWith(expect.objectContaining({ to: '2024-02-29' }));
  });

  it('names each grouped category and carries the grouped totals and rows', async () => {
    const { service } = build([
      expenseRow(1n, 5n, 4250n),
      expenseRow(2n, 5n, 3000n),
      expenseRow(3n, 6n, 12000n),
    ]);
    const report = await service.monthly('2026-09');
    expect(report.month).toBe('2026-09');
    expect(report.grandTotal).toBe(19250n);
    expect(report.categories.map((category) => [category.categoryName, category.total])).toEqual([
      ['Rent', 12000n],
      ['Groceries', 7250n],
    ]);
    expect(report.categories[1].transactions.map((row) => row.id)).toEqual([1n, 2n]);
  });

  it('answers an empty month as no categories and a zero grand total (US3 #2)', async () => {
    const { service } = build([]);
    const report = await service.monthly('2026-08');
    expect(report).toEqual({ month: '2026-08', grandTotal: 0n, categories: [] });
  });
});

describe('ReportsService.similar', () => {
  it('reads only expenses within the range and groups them', async () => {
    const { service, ledger } = build([expenseRow(1n, 5n, 4250n), expenseRow(2n, 5n, 3000n)]);
    const report = await service.similar('2026-09-01', '2026-09-30');
    expect(ledger.listAll).toHaveBeenCalledWith({
      kind: 'expense',
      from: '2026-09-01',
      to: '2026-09-30',
    });
    expect(report.from).toBe('2026-09-01');
    expect(report.to).toBe('2026-09-30');
    expect(report.groups.map((group) => [group.key, group.count, group.total])).toEqual([
      ['expense', 2, 7250n],
    ]);
    expect(report.topGroupKey).toBe('expense');
  });

  it('rejects an inverted range or one longer than 24 months without reading', async () => {
    const { service, ledger } = build([]);
    await expect(service.similar('2026-09-10', '2026-09-01')).rejects.toBeInstanceOf(
      DateRangeError,
    );
    await expect(service.similar('2024-01-01', '2026-01-02')).rejects.toBeInstanceOf(
      DateRangeError,
    );
    await expect(service.similar('2024-01-01', '2026-01-01')).resolves.toBeDefined();
    expect(ledger.listAll).toHaveBeenCalledTimes(1);
  });
});
