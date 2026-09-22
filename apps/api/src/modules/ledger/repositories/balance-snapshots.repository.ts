import { Injectable } from '@nestjs/common';
import { PrismaService, TransactionClient } from '../../../common/prisma.service/prisma.service';

@Injectable()
export class BalanceSnapshotsRepository {
  constructor(private readonly prisma: PrismaService) {}

  private db(tx?: TransactionClient): TransactionClient {
    return tx ?? this.prisma;
  }

  async applyDelta(accountId: bigint, delta: bigint, tx?: TransactionClient): Promise<void> {
    await this.db(tx).balanceSnapshot.upsert({
      where: { accountId },
      update: { balance: { increment: delta } },
      create: { accountId, balance: delta },
    });
  }

  async get(accountId: bigint, tx?: TransactionClient): Promise<bigint | null> {
    const row = await this.db(tx).balanceSnapshot.findUnique({ where: { accountId } });
    return row?.balance ?? null;
  }
}
