import { Injectable } from '@nestjs/common';
import { Category, CategoryType } from '@prisma/client';
import {
  ArchivedCategoryError,
  CategoryInUseError,
  CategoryTypeMismatchError,
  DomainRuleViolationError,
  DuplicateNameError,
  NotFoundError,
} from '../../../common/domain-errors/domain-errors';
import {
  isUniqueViolation,
  PrismaService,
  TransactionClient,
} from '../../../common/prisma.service/prisma.service';
import { LedgerService } from '../../ledger/services/ledger.service';
import { CategoriesRepository } from '../repositories/categories.repository';

const NAME_INDEX = 'categories_name_unique';

@Injectable()
export class CategoriesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly categories: CategoriesRepository,
    private readonly ledger: LedgerService,
  ) {}

  list(includeArchived: boolean): Promise<Category[]> {
    return this.categories.list(includeArchived);
  }

  async create(input: { name: string; type: CategoryType }): Promise<Category> {
    try {
      return await this.prisma.withTransaction(async (tx) => {
        const row = await this.categories.create(input, tx);
        await this.ledger.createCategorySystemAccount(row.id, tx);
        return row;
      });
    } catch (error) {
      if (isUniqueViolation(error, NAME_INDEX))
        throw new DuplicateNameError('category', input.name);
      throw error;
    }
  }

  async update(id: bigint, input: { name: string; type?: CategoryType }): Promise<Category> {
    const existing = await this.categories.findById(id);
    if (!existing) throw new NotFoundError('Category', id);
    const changesType = input.type !== undefined && input.type !== existing.type;
    if (changesType && (await this.ledger.hasEntriesForCategory(id))) {
      throw new CategoryInUseError(id);
    }
    try {
      return await this.categories.update(id, {
        name: input.name,
        ...(changesType ? { type: input.type } : {}),
      });
    } catch (error) {
      if (isUniqueViolation(error, NAME_INDEX))
        throw new DuplicateNameError('category', input.name);
      throw error;
    }
  }

  async setArchived(id: bigint, archived: boolean): Promise<Category> {
    const existing = await this.categories.findById(id);
    if (!existing) throw new NotFoundError('Category', id);
    return this.categories.setArchived(id, archived);
  }

  async assertUsable(
    categoryId: bigint,
    expectedType: CategoryType,
    tx?: TransactionClient,
  ): Promise<void> {
    const row = await this.categories.findById(categoryId, tx);
    if (!row) {
      throw new DomainRuleViolationError(`Category ${categoryId} does not exist`, [
        { field: 'categoryId', message: 'category does not exist' },
      ]);
    }
    if (row.archived) throw new ArchivedCategoryError(categoryId);
    if (row.type !== expectedType) throw new CategoryTypeMismatchError(expectedType);
  }
}
