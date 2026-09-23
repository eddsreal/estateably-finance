import { Injectable } from '@nestjs/common';
import { PrismaService, TransactionClient } from '../../../common/prisma.service/prisma.service';
import { toDateOnly } from '../../../common/dates/dates';
import { DatedAmount } from '../domain/balance-at';

@Injectable()
export class EntriesRepository {
  constructor(private readonly prisma: PrismaService) {}

  private db(tx?: TransactionClient): TransactionClient {
    return tx ?? this.prisma;
  }

  async deleteByTransaction(transactionId: bigint, tx?: TransactionClient): Promise<void> {
    await this.db(tx).entry.deleteMany({ where: { transactionId } });
  }

  async existsForCategory(categoryId: bigint, tx?: TransactionClient): Promise<boolean> {
    const row = await this.db(tx).entry.findFirst({
      where: { systemAccount: { categoryId } },
      select: { id: true },
    });
    return row !== null;
  }

  async listForAccount(accountId: bigint, tx?: TransactionClient): Promise<DatedAmount[]> {
    const rows = await this.db(tx).entry.findMany({
      where: { accountId, transaction: { deletedAt: null } },
      select: { amount: true, transaction: { select: { date: true } } },
    });
    return rows.map((row) => ({ date: toDateOnly(row.transaction.date), amount: row.amount }));
  }
}
