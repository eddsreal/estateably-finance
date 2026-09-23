import { Module } from '@nestjs/common';
import { AccountsModule } from '../accounts/accounts.module';
import { CategoriesModule } from '../categories/categories.module';
import { ProjectionController } from './controllers/projection.controller';
import { ScheduledItemsController } from './controllers/scheduled-items.controller';
import { ScheduledItemsRepository } from './repositories/scheduled-items.repository';
import { ScheduledItemsService } from './services/scheduled-items.service';

@Module({
  imports: [AccountsModule, CategoriesModule],
  controllers: [ScheduledItemsController, ProjectionController],
  providers: [ScheduledItemsRepository, ScheduledItemsService],
  exports: [ScheduledItemsService],
})
export class ScheduledItemsModule {}
