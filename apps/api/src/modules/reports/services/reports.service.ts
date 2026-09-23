import { Injectable } from '@nestjs/common';
import { toDateOnly } from '../../../common/dates/dates';
import { CategoriesService } from '../../categories/services/categories.service';
import { LedgerService, TransactionWithEntries } from '../../ledger/services/ledger.service';
import { monthlyReport } from '../domain/monthly-report';

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
}
