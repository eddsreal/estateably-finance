import { Injectable } from '@nestjs/common';
import { spanExceedsMonths, toDateOnly } from '../../../common/dates/dates';
import { DateRangeError } from '../../../common/domain-errors/domain-errors';
import { CategoriesService } from '../../categories/services/categories.service';
import { LedgerService, TransactionWithEntries } from '../../ledger/services/ledger.service';
import { monthlyReport } from '../domain/monthly-report';
import { SimilarGroup, similarReport } from '../domain/similar-report';

export type MonthlyReportCategory = {
  categoryId: bigint;
  categoryName: string;
  total: bigint;
  transactions: TransactionWithEntries[];
};

export type MonthlyReportData = {
  month: string;
  grandTotal: bigint;
  categories: MonthlyReportCategory[];
};

export type SimilarReportData = {
  from: string;
  to: string;
  groups: SimilarGroup<TransactionWithEntries>[];
  topTransactions: TransactionWithEntries[];
  topGroupKey: string | null;
};

function monthEnd(month: string): string {
  const [year, monthNumber] = month.split('-').map(Number);
  return toDateOnly(new Date(Date.UTC(year, monthNumber, 0)));
}

@Injectable()
export class ReportsService {
  constructor(
    private readonly ledger: LedgerService,
    private readonly categories: CategoriesService,
  ) {}

  async monthly(month: string): Promise<MonthlyReportData> {
    const rows = await this.ledger.listAll({
      kind: 'expense',
      from: `${month}-01`,
      to: monthEnd(month),
    });
    const report = monthlyReport(rows);
    const names = new Map((await this.categories.list(true)).map((row) => [row.id, row.name]));
    return {
      month,
      grandTotal: report.grandTotal,
      categories: report.groups.map((group) => ({
        categoryId: group.categoryId,
        categoryName: names.get(group.categoryId) ?? '',
        total: group.total,
        transactions: group.transactions,
      })),
    };
  }

  async similar(from: string, to: string): Promise<SimilarReportData> {
    if (from > to) throw new DateRangeError('the range must start on or before its end');
    if (spanExceedsMonths(from, to, 24)) {
      throw new DateRangeError('the range must span at most 24 months');
    }
    const rows = await this.ledger.listAll({ kind: 'expense', from, to });
    return { from, to, ...similarReport(rows) };
  }
}
