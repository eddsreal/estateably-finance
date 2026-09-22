import { Injectable } from '@nestjs/common';
import { Prisma, TransactionKind } from '@prisma/client';
import { PrismaService, TransactionClient } from '../../../common/prisma.service/prisma.service';
import { EntryDraft } from '../domain/to-entries';

export function toDate(date: string): Date {
  return new Date(`${date}T00:00:00Z`);
}

export function toDateOnly(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export type TransactionRow = {
  kind: TransactionKind;
  date: string;
  description: string;
  projectId?: bigint | null;
};

export type TransactionFilters = {
  accountId?: bigint;
  kind?: TransactionKind;
  categoryId?: bigint;
  projectId?: bigint;
  from?: string;
  to?: string;
};

export type TransactionWithEntries = Prisma.TransactionGetPayload<{ include: { entries: true } }>;

@Injectable()
export class TransactionsRepository {
  constructor(private readonly prisma: PrismaService) {}

  private db(tx?: TransactionClient): TransactionClient {
    return tx ?? this.prisma;
  }

  create(
    row: TransactionRow,
    entries: EntryDraft[],
    tx?: TransactionClient,
  ): Promise<TransactionWithEntries> {
    return this.db(tx).transaction.create({
      data: {
        kind: row.kind,
        date: toDate(row.date),
        description: row.description,
        projectId: row.projectId ?? null,
        entries: { create: entries },
      },
      include: { entries: true },
    });
  }

  findLiveById(id: bigint, tx?: TransactionClient): Promise<TransactionWithEntries | null> {
    return this.db(tx).transaction.findFirst({
      where: { id, deletedAt: null },
      include: { entries: true },
    });
  }

  replaceIntent(
    id: bigint,
    row: TransactionRow,
    entries: EntryDraft[],
    tx?: TransactionClient,
  ): Promise<TransactionWithEntries> {
    return this.db(tx).transaction.update({
      where: { id },
      data: {
        kind: row.kind,
        date: toDate(row.date),
        description: row.description,
        projectId: row.projectId ?? null,
        entries: { create: entries },
      },
      include: { entries: true },
    });
  }

  async softDelete(id: bigint, tx?: TransactionClient): Promise<void> {
    await this.db(tx).transaction.update({ where: { id }, data: { deletedAt: new Date() } });
  }

  async list(
    filters: TransactionFilters,
    limit: number,
    offset: number,
    tx?: TransactionClient,
  ): Promise<{ items: TransactionWithEntries[]; total: number }> {
    const where: Prisma.TransactionWhereInput = {
      deletedAt: null,
      ...(filters.kind ? { kind: filters.kind } : {}),
      ...(filters.projectId !== undefined ? { projectId: filters.projectId } : {}),
      ...(filters.from || filters.to
        ? {
            date: {
              ...(filters.from ? { gte: toDate(filters.from) } : {}),
              ...(filters.to ? { lte: toDate(filters.to) } : {}),
            },
          }
        : {}),
      ...(filters.accountId !== undefined
        ? { entries: { some: { accountId: filters.accountId } } }
        : {}),
      ...(filters.categoryId !== undefined
        ? { entries: { some: { systemAccount: { categoryId: filters.categoryId } } } }
        : {}),
    };
    const db = this.db(tx);
    const [items, total] = await Promise.all([
      db.transaction.findMany({
        where,
        include: { entries: true },
        orderBy: [{ date: 'desc' }, { id: 'desc' }],
        skip: offset,
        take: limit,
      }),
      db.transaction.count({ where }),
    ]);
    return { items, total };
  }
}
