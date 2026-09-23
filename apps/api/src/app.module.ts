import { Module } from '@nestjs/common';
import { PrismaModule } from './common/prisma.service/prisma.module';
import { AccountsModule } from './modules/accounts/accounts.module';
import { CategoriesModule } from './modules/categories/categories.module';
import { LedgerModule } from './modules/ledger/ledger.module';
import { ProjectsModule } from './modules/projects/projects.module';
import { ReportsModule } from './modules/reports/reports.module';
import { ScheduledItemsModule } from './modules/scheduled-items/scheduled-items.module';

@Module({
  imports: [
    PrismaModule,
    LedgerModule,
    CategoriesModule,
    ProjectsModule,
    AccountsModule,
    ScheduledItemsModule,
    ReportsModule,
  ],
})
export class AppModule {}
