import { TransactionKind } from '@prisma/client';
import { toDateOnly } from '../../../common/dates/dates';
import { TransactionWithEntries } from '../../ledger/services/ledger.service';
import { MonthlyReportData } from '../services/reports.service';

export class ReportTransactionDto {
  id!: string;
  kind!: TransactionKind;
  date!: string;
  description!: string;
  amount!: string;
  accountId!: string;
  categoryId?: string;
  projectId?: string;

  static from(row: TransactionWithEntries): ReportTransactionDto {
    const user = row.entries.find((entry) => entry.accountId !== null)!;
    const system = row.entries.find((entry) => entry.systemAccountId !== null);
    const dto: ReportTransactionDto = {
      id: row.id.toString(),
      kind: row.kind,
      date: toDateOnly(row.date),
      description: row.description,
      amount: (user.amount < 0n ? -user.amount : user.amount).toString(),
      accountId: user.accountId!.toString(),
    };
    const categoryId = system?.systemAccount?.categoryId;
    if (categoryId != null) dto.categoryId = categoryId.toString();
    if (row.projectId != null) dto.projectId = row.projectId.toString();
    return dto;
  }
}

export class MonthlyReportCategoryDto {
  categoryId!: string;
  categoryName!: string;
  total!: string;
  transactions!: ReportTransactionDto[];
}

export class MonthlyReportResponseDto {
  month!: string;
  grandTotal!: string;
  categories!: MonthlyReportCategoryDto[];

  static from(data: MonthlyReportData): MonthlyReportResponseDto {
    return {
      month: data.month,
      grandTotal: data.grandTotal.toString(),
      categories: data.categories.map((category) => ({
        categoryId: category.categoryId.toString(),
        categoryName: category.categoryName,
        total: category.total.toString(),
        transactions: category.transactions.map((row) => ReportTransactionDto.from(row)),
      })),
    };
  }
}
