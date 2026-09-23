import { Module } from '@nestjs/common';
import { PrismaModule } from './common/prisma.service/prisma.module';
import { AccountsModule } from './modules/accounts/accounts.module';
import { CategoriesModule } from './modules/categories/categories.module';
import { LedgerModule } from './modules/ledger/ledger.module';
import { ProjectsModule } from './modules/projects/projects.module';

@Module({
  imports: [PrismaModule, LedgerModule, CategoriesModule, ProjectsModule, AccountsModule],
})
export class AppModule {}
