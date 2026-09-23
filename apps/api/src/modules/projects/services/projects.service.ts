import { Injectable } from '@nestjs/common';
import { Project, ProjectStatus } from '@prisma/client';
import {
  ClosedProjectError,
  DomainRuleViolationError,
  DuplicateNameError,
  NotFoundError,
  ProjectInUseError,
} from '../../../common/domain-errors/domain-errors';
import {
  isUniqueViolation,
  PrismaService,
  TransactionClient,
} from '../../../common/prisma.service/prisma.service';
import { LedgerService, TransactionPage } from '../../ledger/services/ledger.service';
import { ProjectsRepository } from '../repositories/projects.repository';

const NAME_INDEX = 'projects_name_unique';

export type ProjectReport = { project: Project; spent: bigint };

@Injectable()
export class ProjectsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly projects: ProjectsRepository,
    private readonly ledger: LedgerService,
  ) {}

  private async report(project: Project): Promise<ProjectReport> {
    return { project, spent: (await this.ledger.spentByProject()).get(project.id) ?? 0n };
  }

  private async existing(id: bigint): Promise<Project> {
    const row = await this.projects.findById(id);
    if (!row) throw new NotFoundError('Project', id);
    return row;
  }

  private async saving(name: string | undefined, write: () => Promise<Project>): Promise<Project> {
    try {
      return await write();
    } catch (error) {
      if (name !== undefined && isUniqueViolation(error, NAME_INDEX)) {
        throw new DuplicateNameError('project', name);
      }
      throw error;
    }
  }

  async list(): Promise<ProjectReport[]> {
    const [rows, spent] = await Promise.all([this.projects.list(), this.ledger.spentByProject()]);
    return rows.map((project) => ({ project, spent: spent.get(project.id) ?? 0n }));
  }

  async create(input: { name: string; budget?: bigint }): Promise<ProjectReport> {
    const row = await this.saving(input.name, () =>
      this.projects.create({ name: input.name, budget: input.budget ?? null }),
    );
    return { project: row, spent: 0n };
  }

  async update(
    id: bigint,
    input: { name?: string; budget?: bigint | null },
  ): Promise<ProjectReport> {
    await this.existing(id);
    const row = await this.saving(input.name, () => this.projects.update(id, input));
    return this.report(row);
  }

  async setStatus(id: bigint, status: ProjectStatus): Promise<ProjectReport> {
    await this.existing(id);
    return this.report(await this.projects.update(id, { status }));
  }

  remove(id: bigint): Promise<void> {
    return this.prisma.withTransaction(async (tx) => {
      if (!(await this.projects.lockById(id, tx))) throw new NotFoundError('Project', id);
      if (await this.ledger.hasTransactionsForProject(id, tx)) throw new ProjectInUseError(id);
      await this.projects.delete(id, tx);
    });
  }

  async listTransactions(
    id: bigint,
    page: { limit?: number; offset?: number },
  ): Promise<TransactionPage> {
    await this.existing(id);
    return this.ledger.list({ projectId: id, kind: 'expense', ...page });
  }

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
