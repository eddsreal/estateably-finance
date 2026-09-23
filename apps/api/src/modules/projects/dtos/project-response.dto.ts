import { ProjectStatus, TransactionKind } from '@prisma/client';
import { toDateOnly } from '../../../common/dates/dates';
import { TransactionPage, TransactionWithEntries } from '../../ledger/services/ledger.service';
import { ProjectReport } from '../services/projects.service';

export class ProjectResponseDto {
  id!: string;
  name!: string;
  status!: ProjectStatus;
  budget?: string;
  spent!: string;
  remaining?: string;
  overBudget!: boolean;

  static from({ project, spent }: ProjectReport): ProjectResponseDto {
    const dto: ProjectResponseDto = {
      id: project.id.toString(),
      name: project.name,
      status: project.status,
      spent: spent.toString(),
      overBudget: false,
    };
    if (project.budget !== null) {
      dto.budget = project.budget.toString();
      dto.remaining = (project.budget - spent).toString();
      dto.overBudget = spent > project.budget;
    }
    return dto;
  }
}

export class ProjectTransactionDto {
  id!: string;
  kind!: TransactionKind;
  date!: string;
  description!: string;
  amount!: string;
  accountId!: string;
  categoryId?: string;
  projectId?: string;

  static from(row: TransactionWithEntries): ProjectTransactionDto {
    const user = row.entries.find((entry) => entry.accountId !== null)!;
    const system = row.entries.find((entry) => entry.systemAccountId !== null);
    const dto: ProjectTransactionDto = {
      id: row.id.toString(),
      kind: row.kind,
      date: toDateOnly(row.date),
      description: row.description,
      amount: (user.amount < 0n ? -user.amount : user.amount).toString(),
      accountId: user.accountId!.toString(),
    };
    const categoryId = system?.systemAccount?.categoryId;
    if (categoryId != null) dto.categoryId = categoryId.toString();
    if (row.projectId != null) dto.projectId = row.projectId.toString();
    return dto;
  }
}

export class ProjectTransactionPageDto {
  items!: ProjectTransactionDto[];
  total!: number;
  limit!: number;
  offset!: number;

  static from(page: TransactionPage): ProjectTransactionPageDto {
    return {
      items: page.items.map((item) => ProjectTransactionDto.from(item)),
      total: page.total,
      limit: page.limit,
      offset: page.offset,
    };
  }
}
