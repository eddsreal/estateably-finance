import { Injectable } from '@nestjs/common';
import { Account, AccountKind } from '@prisma/client';
import { toDate } from '../../../common/dates/dates';
import { PrismaService, TransactionClient } from '../../../common/prisma.service/prisma.service';

@Injectable()
export class AccountsRepository {
  constructor(private readonly prisma: PrismaService) {}

  private db(tx?: TransactionClient): TransactionClient {
    return tx ?? this.prisma;
  }

  create(
    data: { name: string; kind: AccountKind; openingDate: string },
    tx?: TransactionClient,
  ): Promise<Account> {
    return this.db(tx).account.create({
      data: { name: data.name, kind: data.kind, openingDate: toDate(data.openingDate) },
    });
  }

  findById(id: bigint, tx?: TransactionClient): Promise<Account | null> {
    return this.db(tx).account.findUnique({ where: { id } });
  }

  update(
    id: bigint,
    data: { name?: string; kind?: AccountKind; openingDate?: string },
    tx?: TransactionClient,
  ): Promise<Account> {
    return this.db(tx).account.update({
      where: { id },
      data: {
        ...(data.name !== undefined ? { name: data.name } : {}),
        ...(data.kind !== undefined ? { kind: data.kind } : {}),
        ...(data.openingDate !== undefined ? { openingDate: toDate(data.openingDate) } : {}),
      },
    });
  }

  setArchived(id: bigint, archived: boolean, tx?: TransactionClient): Promise<Account> {
    return this.db(tx).account.update({ where: { id }, data: { archived } });
  }

  list(includeArchived: boolean, tx?: TransactionClient): Promise<Account[]> {
    return this.db(tx).account.findMany({
      where: includeArchived ? {} : { archived: false },
      orderBy: [{ name: 'asc' }],
    });
  }
}
