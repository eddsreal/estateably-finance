import {
  Recurrence,
  ScheduledItemKind,
  ScheduledItemStatus,
  TransactionKind,
} from '@prisma/client';
import { toDateOnly } from '../../../common/dates/dates';
import { TransactionWithEntries } from '../../ledger/services/ledger.service';
import { ProjectionOccurrence } from '../domain/projection';
import { ProjectionView, ScheduledItemView } from '../services/scheduled-items.service';

export class ScheduledItemResponseDto {
  id!: string;
  kind!: ScheduledItemKind;
  description!: string;
  amount!: string;
  accountId!: string;
  categoryId!: string;
  nextDueDate!: string;
  recurrence!: Recurrence;
  endDate?: string;
  status!: ScheduledItemStatus;
  overdue!: boolean;
  overdueCount!: number;
  accountArchived!: boolean;

  static from(view: ScheduledItemView): ScheduledItemResponseDto {
    const dto: ScheduledItemResponseDto = {
      id: view.row.id.toString(),
      kind: view.row.kind,
      description: view.row.description,
      amount: view.row.amount.toString(),
      accountId: view.row.accountId.toString(),
      categoryId: view.row.categoryId.toString(),
      nextDueDate: toDateOnly(view.row.nextDueDate),
      recurrence: view.row.recurrence,
      status: view.row.status,
      overdue: view.overdue,
      overdueCount: view.overdueCount,
      accountArchived: view.row.account.archived,
    };
    if (view.row.endDate !== null) dto.endDate = toDateOnly(view.row.endDate);
    return dto;
  }
}

export class ConfirmedTransactionDto {
  id!: string;
  kind!: TransactionKind;
  date!: string;
  description!: string;
  amount!: string;
  accountId!: string;
  categoryId?: string;

  static from(row: TransactionWithEntries): ConfirmedTransactionDto {
    const user = row.entries.find((entry) => entry.accountId !== null)!;
    const system = row.entries.find((entry) => entry.systemAccountId !== null);
    const dto: ConfirmedTransactionDto = {
      id: row.id.toString(),
      kind: row.kind,
      date: toDateOnly(row.date),
      description: row.description,
      amount: (user.amount < 0n ? -user.amount : user.amount).toString(),
      accountId: user.accountId!.toString(),
    };
    const categoryId = system?.systemAccount?.categoryId;
    if (categoryId != null) dto.categoryId = categoryId.toString();
    return dto;
  }
}

export class ConfirmScheduledItemResponseDto {
  transaction!: ConfirmedTransactionDto;
  item!: ScheduledItemResponseDto;

  static from(result: {
    transaction: TransactionWithEntries;
    item: ScheduledItemView;
  }): ConfirmScheduledItemResponseDto {
    return {
      transaction: ConfirmedTransactionDto.from(result.transaction),
      item: ScheduledItemResponseDto.from(result.item),
    };
  }
}

export class ProjectionOccurrenceDto {
  date!: string;
  scheduledItemId!: string;
  description!: string;
  kind!: ScheduledItemKind;
  amount!: string;
  runningBalance!: string;
  overdue!: boolean;

  static from(occurrence: ProjectionOccurrence): ProjectionOccurrenceDto {
    return {
      date: occurrence.date,
      scheduledItemId: occurrence.scheduledItemId.toString(),
      description: occurrence.description,
      kind: occurrence.kind,
      amount: occurrence.amount.toString(),
      runningBalance: occurrence.runningBalance.toString(),
      overdue: occurrence.overdue,
    };
  }
}

export class ProjectionResponseDto {
  horizon!: string;
  startingBalance!: string;
  finalBalance!: string;
  occurrences!: ProjectionOccurrenceDto[];

  static from(view: ProjectionView): ProjectionResponseDto {
    return {
      horizon: view.horizon,
      startingBalance: view.startingBalance.toString(),
      finalBalance: view.finalBalance.toString(),
      occurrences: view.occurrences.map((occurrence) => ProjectionOccurrenceDto.from(occurrence)),
    };
  }
}
