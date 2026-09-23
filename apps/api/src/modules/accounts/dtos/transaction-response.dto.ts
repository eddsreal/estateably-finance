import { TransactionKind } from '@prisma/client';
import { toDateOnly } from '../../../common/dates/dates';
import { TransactionPage, TransactionWithEntries } from '../../ledger/services/ledger.service';

export class TransactionResponseDto {
  id!: string;
  kind!: TransactionKind;
  date!: string;
  description!: string;
  amount!: string;
  accountId!: string;
  counterAccountId?: string;
  categoryId?: string;
  projectId?: string;

  static from(row: TransactionWithEntries): TransactionResponseDto {
    const userEntries = row.entries.filter((entry) => entry.accountId !== null);
    const systemEntry = row.entries.find((entry) => entry.systemAccountId !== null);
    const dto: TransactionResponseDto = {
      id: row.id.toString(),
      kind: row.kind,
      date: toDateOnly(row.date),
      description: row.description,
      amount: '0',
      accountId: '0',
    };
    switch (row.kind) {
      case 'expense':
      case 'income': {
        const user = userEntries[0];
        dto.amount = (user.amount < 0n ? -user.amount : user.amount).toString();
        dto.accountId = user.accountId!.toString();
        const categoryId = systemEntry?.systemAccount?.categoryId;
        if (categoryId != null) dto.categoryId = categoryId.toString();
        break;
      }
      case 'transfer': {
        const source = userEntries.find((entry) => entry.amount < 0n);
        const destination = userEntries.find((entry) => entry.amount > 0n);
        dto.amount = destination!.amount.toString();
        dto.accountId = source!.accountId!.toString();
        dto.counterAccountId = destination!.accountId!.toString();
        break;
      }
      case 'opening': {
        const user = userEntries[0];
        dto.amount = user.amount.toString();
        dto.accountId = user.accountId!.toString();
        break;
      }
    }
    if (row.projectId != null) dto.projectId = row.projectId.toString();
    return dto;
  }
}

export class PaginatedTransactionsDto {
  items!: TransactionResponseDto[];
  total!: number;
  limit!: number;
  offset!: number;

  static from(page: TransactionPage): PaginatedTransactionsDto {
    return {
      items: page.items.map((item) => TransactionResponseDto.from(item)),
      total: page.total,
      limit: page.limit,
      offset: page.offset,
    };
  }
}
