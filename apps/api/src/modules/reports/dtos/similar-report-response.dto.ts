import { SimilarReportData } from '../services/reports.service';
import { ReportTransactionDto } from './monthly-report-response.dto';

export class SimilarGroupDto {
  key!: string;
  count!: number;
  total!: string;
  transactions!: ReportTransactionDto[];
}

export class SimilarReportResponseDto {
  from!: string;
  to!: string;
  groups!: SimilarGroupDto[];
  topTransactions!: ReportTransactionDto[];
  topGroupKey!: string | null;

  static from(data: SimilarReportData): SimilarReportResponseDto {
    return {
      from: data.from,
      to: data.to,
      groups: data.groups.map((group) => ({
        key: group.key,
        count: group.count,
        total: group.total.toString(),
        transactions: group.transactions.map((row) => ReportTransactionDto.from(row)),
      })),
      topTransactions: data.topTransactions.map((row) => ReportTransactionDto.from(row)),
      topGroupKey: data.topGroupKey,
    };
  }
}
