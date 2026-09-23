import { Injectable } from '@nestjs/common';
import { Recurrence, ScheduledItem, ScheduledItemKind, ScheduledItemStatus } from '@prisma/client';
import { toDate } from '../../../common/dates/dates';
import { PrismaService, TransactionClient } from '../../../common/prisma.service/prisma.service';

export type ScheduledItemWithAccount = ScheduledItem & { account: { archived: boolean } };

export type ScheduledItemData = {
  kind: ScheduledItemKind;
  description: string;
  amount: bigint;
  accountId: bigint;
  categoryId: bigint;
  nextDueDate: string;
  recurrence: Recurrence;
  endDate?: string;
};

const WITH_ACCOUNT = { account: { select: { archived: true } } } as const;

@Injectable()
export class ScheduledItemsRepository {
  constructor(private readonly prisma: PrismaService) {}

  private db(tx?: TransactionClient): TransactionClient {
    return tx ?? this.prisma;
  }

  create(data: ScheduledItemData, tx?: TransactionClient): Promise<ScheduledItemWithAccount> {
    return this.db(tx).scheduledItem.create({
      data: {
        kind: data.kind,
        description: data.description,
        amount: data.amount,
        accountId: data.accountId,
        categoryId: data.categoryId,
        nextDueDate: toDate(data.nextDueDate),
        recurrence: data.recurrence,
        endDate: data.endDate === undefined ? null : toDate(data.endDate),
      },
      include: WITH_ACCOUNT,
    });
  }

  findById(id: bigint, tx?: TransactionClient): Promise<ScheduledItemWithAccount | null> {
    return this.db(tx).scheduledItem.findUnique({ where: { id }, include: WITH_ACCOUNT });
  }

  replace(
    id: bigint,
    data: ScheduledItemData,
    tx?: TransactionClient,
  ): Promise<ScheduledItemWithAccount> {
    return this.db(tx).scheduledItem.update({
      where: { id },
      data: {
        kind: data.kind,
        description: data.description,
        amount: data.amount,
        accountId: data.accountId,
        categoryId: data.categoryId,
        nextDueDate: toDate(data.nextDueDate),
        recurrence: data.recurrence,
        endDate: data.endDate === undefined ? null : toDate(data.endDate),
      },
      include: WITH_ACCOUNT,
    });
  }

  setAdvanced(
    id: bigint,
    patch: { nextDueDate?: string; status?: ScheduledItemStatus },
    tx?: TransactionClient,
  ): Promise<ScheduledItemWithAccount> {
    return this.db(tx).scheduledItem.update({
      where: { id },
      data: {
        ...(patch.nextDueDate !== undefined ? { nextDueDate: toDate(patch.nextDueDate) } : {}),
        ...(patch.status !== undefined ? { status: patch.status } : {}),
      },
      include: WITH_ACCOUNT,
    });
  }

  delete(id: bigint, tx?: TransactionClient): Promise<void> {
    return this.db(tx)
      .scheduledItem.delete({ where: { id } })
      .then(() => undefined);
  }

  listActive(tx?: TransactionClient): Promise<ScheduledItemWithAccount[]> {
    return this.db(tx).scheduledItem.findMany({
      where: { status: 'active' },
      orderBy: [{ nextDueDate: 'asc' }, { id: 'asc' }],
      include: WITH_ACCOUNT,
    });
  }
}
