import { Injectable } from '@nestjs/common';
import { Project, ProjectStatus } from '@prisma/client';
import { PrismaService, TransactionClient } from '../../../common/prisma.service/prisma.service';

@Injectable()
export class ProjectsRepository {
  constructor(private readonly prisma: PrismaService) {}

  private db(tx?: TransactionClient): TransactionClient {
    return tx ?? this.prisma;
  }

  findById(id: bigint, tx?: TransactionClient): Promise<Project | null> {
    return this.db(tx).project.findUnique({ where: { id } });
  }

  async lockById(id: bigint, tx: TransactionClient): Promise<boolean> {
    const rows = await tx.$queryRaw<{ id: bigint }[]>`
      SELECT id FROM projects WHERE id = ${id} FOR UPDATE
    `;
    return rows.length > 0;
  }

  list(tx?: TransactionClient): Promise<Project[]> {
    return this.db(tx).project.findMany({ orderBy: [{ name: 'asc' }] });
  }

  create(data: { name: string; budget: bigint | null }, tx?: TransactionClient): Promise<Project> {
    return this.db(tx).project.create({ data });
  }

  update(
    id: bigint,
    data: { name?: string; budget?: bigint | null; status?: ProjectStatus },
    tx?: TransactionClient,
  ): Promise<Project> {
    return this.db(tx).project.update({ where: { id }, data });
  }

  async delete(id: bigint, tx?: TransactionClient): Promise<void> {
    await this.db(tx).project.delete({ where: { id } });
  }
}
