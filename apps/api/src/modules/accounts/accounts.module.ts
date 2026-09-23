import { Module } from '@nestjs/common';
import { CategoriesModule } from '../categories/categories.module';
import { LedgerModule } from '../ledger/ledger.module';
import { ProjectsModule } from '../projects/projects.module';
import { AccountsController } from './controllers/accounts.controller';
import { TransactionsController } from './controllers/transactions.controller';
import { AccountsRepository } from './repositories/accounts.repository';
import { AccountsService } from './services/accounts.service';
import { TransactionsService } from './services/transactions.service';

@Module({
  imports: [LedgerModule, CategoriesModule, ProjectsModule],
  controllers: [AccountsController, TransactionsController],
  providers: [AccountsRepository, AccountsService, TransactionsService],
  exports: [AccountsService, TransactionsService],
})
export class AccountsModule {}
