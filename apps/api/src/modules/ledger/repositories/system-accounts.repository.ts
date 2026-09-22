import { Injectable } from '@nestjs/common';
import { SystemAccount } from '@prisma/client';
import { PrismaService, TransactionClient } from '../../../common/prisma.service/prisma.service';

@Injectable()
export class SystemAccountsRepository {
  constructor(private readonly prisma: PrismaService) {}

  private db(tx?: TransactionClient): TransactionClient {
    return tx ?? this.prisma;
  }

  findEquity(tx?: TransactionClient): Promise<SystemAccount | null> {
    return this.db(tx).systemAccount.findFirst({ where: { kind: 'equity' } });
  }

  findByCategoryId(categoryId: bigint, tx?: TransactionClient): Promise<SystemAccount | null> {
    return this.db(tx).systemAccount.findUnique({ where: { categoryId } });
  }

  createForCategory(categoryId: bigint, tx?: TransactionClient): Promise<SystemAccount> {
    return this.db(tx).systemAccount.create({ data: { kind: 'category', categoryId } });
  }
}
