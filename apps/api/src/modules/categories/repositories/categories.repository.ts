import { Injectable } from '@nestjs/common';
import { Category, CategoryType } from '@prisma/client';
import { PrismaService, TransactionClient } from '../../../common/prisma.service/prisma.service';

@Injectable()
export class CategoriesRepository {
  constructor(private readonly prisma: PrismaService) {}

  private db(tx?: TransactionClient): TransactionClient {
    return tx ?? this.prisma;
  }

  create(data: { name: string; type: CategoryType }, tx?: TransactionClient): Promise<Category> {
    return this.db(tx).category.create({ data });
  }

  findById(id: bigint, tx?: TransactionClient): Promise<Category | null> {
    return this.db(tx).category.findUnique({ where: { id } });
  }

  update(
    id: bigint,
    data: { name?: string; type?: CategoryType },
    tx?: TransactionClient,
  ): Promise<Category> {
    return this.db(tx).category.update({ where: { id }, data });
  }

  setArchived(id: bigint, archived: boolean, tx?: TransactionClient): Promise<Category> {
    return this.db(tx).category.update({ where: { id }, data: { archived } });
  }

  list(includeArchived: boolean, tx?: TransactionClient): Promise<Category[]> {
    return this.db(tx).category.findMany({
      where: includeArchived ? {} : { archived: false },
      orderBy: [{ name: 'asc' }],
    });
  }
}
