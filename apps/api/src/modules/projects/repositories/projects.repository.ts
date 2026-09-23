import { Injectable } from '@nestjs/common';
import { Project } from '@prisma/client';
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
}
