import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ArchivedCategoryError,
  CategoryInUseError,
  CategoryTypeMismatchError,
  DomainRuleViolationError,
  DuplicateNameError,
  NotFoundError,
} from '../../../common/domain-errors/domain-errors';
import { PrismaService, TransactionClient } from '../../../common/prisma.service/prisma.service';
import { LedgerService } from '../../ledger/services/ledger.service';
import { CategoriesRepository } from '../repositories/categories.repository';
import { CategoriesService } from './categories.service';

const fakeTx = { fake: true } as unknown as TransactionClient;

function build() {
  const asyncMock = () => vi.fn<(...args: unknown[]) => Promise<unknown>>();
  const mocks = {
    prisma: {
      withTransaction: vi.fn<(fn: (tx: TransactionClient) => Promise<unknown>) => Promise<unknown>>(
        (fn) => fn(fakeTx),
      ),
    },
    categories: {
      create: asyncMock(),
      findById: asyncMock(),
      update: asyncMock(),
      setArchived: asyncMock(),
      list: asyncMock().mockResolvedValue([]),
    },
    ledger: {
      createCategorySystemAccount: asyncMock(),
      hasEntriesForCategory: asyncMock().mockResolvedValue(false),
    },
  };
  const service = new CategoriesService(
    mocks.prisma as unknown as PrismaService,
    mocks.categories as unknown as CategoriesRepository,
    mocks.ledger as unknown as LedgerService,
  );
  return { service, mocks };
}

describe('CategoriesService', () => {
  let service: CategoriesService;
  let mocks: ReturnType<typeof build>['mocks'];

  beforeEach(() => {
    ({ service, mocks } = build());
  });

  it('creates the category and its system account in one transaction', async () => {
    mocks.categories.create.mockResolvedValue({ id: 13n, name: 'Pets', type: 'expense' });
    await service.create({ name: 'Pets', type: 'expense' });
    expect(mocks.prisma.withTransaction).toHaveBeenCalledTimes(1);
    expect(mocks.categories.create).toHaveBeenCalledWith({ name: 'Pets', type: 'expense' }, fakeTx);
    expect(mocks.ledger.createCategorySystemAccount).toHaveBeenCalledWith(13n, fakeTx);
  });

  it('maps the unique-name index violation to DUPLICATE_NAME', async () => {
    mocks.categories.create.mockRejectedValue(
      new Error('duplicate key value violates unique constraint "categories_name_unique"'),
    );
    await expect(service.create({ name: 'Pets', type: 'expense' })).rejects.toBeInstanceOf(
      DuplicateNameError,
    );
  });

  it('changes the type of an unused category', async () => {
    mocks.categories.findById.mockResolvedValue({ id: 13n, type: 'expense', archived: false });
    mocks.categories.update.mockResolvedValue({ id: 13n, type: 'income' });
    await service.update(13n, { name: 'Pets', type: 'income' });
    expect(mocks.ledger.hasEntriesForCategory).toHaveBeenCalledWith(13n);
    expect(mocks.categories.update).toHaveBeenCalledWith(13n, { name: 'Pets', type: 'income' });
  });

  it('rejects a type change on a category referenced by any transaction', async () => {
    mocks.categories.findById.mockResolvedValue({ id: 13n, type: 'expense', archived: false });
    mocks.ledger.hasEntriesForCategory.mockResolvedValue(true);
    await expect(service.update(13n, { name: 'Pets', type: 'income' })).rejects.toBeInstanceOf(
      CategoryInUseError,
    );
    expect(mocks.categories.update).not.toHaveBeenCalled();
  });

  it('renames without touching the type, even on a used category', async () => {
    mocks.categories.findById.mockResolvedValue({ id: 13n, type: 'expense', archived: false });
    mocks.categories.update.mockResolvedValue({ id: 13n });
    await service.update(13n, { name: 'Pets & Vet', type: 'expense' });
    expect(mocks.ledger.hasEntriesForCategory).not.toHaveBeenCalled();
    expect(mocks.categories.update).toHaveBeenCalledWith(13n, { name: 'Pets & Vet' });
  });

  it('answers 404 for a missing path id on update and archive', async () => {
    mocks.categories.findById.mockResolvedValue(null);
    await expect(service.update(99n, { name: 'x' })).rejects.toBeInstanceOf(NotFoundError);
    await expect(service.setArchived(99n, true)).rejects.toBeInstanceOf(NotFoundError);
  });

  it('archives and unarchives symmetrically', async () => {
    mocks.categories.findById.mockResolvedValue({ id: 13n });
    await service.setArchived(13n, true);
    expect(mocks.categories.setArchived).toHaveBeenCalledWith(13n, true);
    await service.setArchived(13n, false);
    expect(mocks.categories.setArchived).toHaveBeenCalledWith(13n, false);
  });

  it('assertUsable rejects missing, archived and mismatched categories as domain rule violations', async () => {
    mocks.categories.findById.mockResolvedValue(null);
    await expect(service.assertUsable(5n, 'expense')).rejects.toBeInstanceOf(
      DomainRuleViolationError,
    );
    mocks.categories.findById.mockResolvedValue({ id: 5n, type: 'expense', archived: true });
    await expect(service.assertUsable(5n, 'expense')).rejects.toBeInstanceOf(ArchivedCategoryError);
    mocks.categories.findById.mockResolvedValue({ id: 5n, type: 'income', archived: false });
    await expect(service.assertUsable(5n, 'expense')).rejects.toBeInstanceOf(
      CategoryTypeMismatchError,
    );
    mocks.categories.findById.mockResolvedValue({ id: 5n, type: 'expense', archived: false });
    await expect(service.assertUsable(5n, 'expense', fakeTx)).resolves.toBeUndefined();
    expect(mocks.categories.findById).toHaveBeenLastCalledWith(5n, fakeTx);
  });
});
