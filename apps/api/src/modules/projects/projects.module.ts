import { Module } from '@nestjs/common';
import { LedgerModule } from '../ledger/ledger.module';
import { ProjectsController } from './controllers/projects.controller';
import { ProjectsRepository } from './repositories/projects.repository';
import { ProjectsService } from './services/projects.service';

@Module({
  imports: [LedgerModule],
  controllers: [ProjectsController],
  providers: [ProjectsRepository, ProjectsService],
  exports: [ProjectsService],
})
export class ProjectsModule {}
