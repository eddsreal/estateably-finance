import { Module } from '@nestjs/common';
import { PrismaService } from '../../common/prisma.service/prisma.service';
import { BalanceSnapshotsRepository } from './repositories/balance-snapshots.repository';
import { EntriesRepository } from './repositories/entries.repository';
import { SystemAccountsRepository } from './repositories/system-accounts.repository';
import { TransactionsRepository } from './repositories/transactions.repository';
import { LedgerService } from './services/ledger.service';

@Module({
  providers: [
    PrismaService,
    TransactionsRepository,
    EntriesRepository,
    SystemAccountsRepository,
    BalanceSnapshotsRepository,
    LedgerService,
  ],
  exports: [LedgerService],
})
export class LedgerModule {}
