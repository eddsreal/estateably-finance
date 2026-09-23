import { Module } from '@nestjs/common';
import { BalanceSnapshotsRepository } from './repositories/balance-snapshots.repository';
import { EntriesRepository } from './repositories/entries.repository';
import { SystemAccountsRepository } from './repositories/system-accounts.repository';
import { TransactionsRepository } from './repositories/transactions.repository';
import { LedgerService } from './services/ledger.service';

@Module({
  providers: [
    TransactionsRepository,
    EntriesRepository,
    SystemAccountsRepository,
    BalanceSnapshotsRepository,
    LedgerService,
  ],
  exports: [LedgerService],
})
export class LedgerModule {}
