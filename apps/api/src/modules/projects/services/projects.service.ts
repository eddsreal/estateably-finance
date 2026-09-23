import { Injectable } from '@nestjs/common';
import {
  ClosedProjectError,
  DomainRuleViolationError,
} from '../../../common/domain-errors/domain-errors';
import { TransactionClient } from '../../../common/prisma.service/prisma.service';
import { ProjectsRepository } from '../repositories/projects.repository';

@Injectable()
export class ProjectsService {
  constructor(private readonly projects: ProjectsRepository) {}

  async assertActive(projectId: bigint, tx?: TransactionClient): Promise<void> {
    const row = await this.projects.findById(projectId, tx);
    if (!row) {
      throw new DomainRuleViolationError(`Project ${projectId} does not exist`, [
        { field: 'projectId', message: 'project does not exist' },
      ]);
    }
    if (row.status === 'closed') throw new ClosedProjectError(projectId);
  }
}
