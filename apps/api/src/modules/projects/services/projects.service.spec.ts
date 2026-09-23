import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ClosedProjectError,
  DomainRuleViolationError,
  DuplicateNameError,
  NotFoundError,
  ProjectInUseError,
} from '../../../common/domain-errors/domain-errors';
import { PrismaService, TransactionClient } from '../../../common/prisma.service/prisma.service';
import { LedgerService } from '../../ledger/services/ledger.service';
import { ProjectsRepository } from '../repositories/projects.repository';
import { ProjectsService } from './projects.service';

const fakeTx = { fake: true } as unknown as TransactionClient;

const trip = { id: 9n, name: 'Trip to France', budget: 500000n, status: 'active' as const };

function build() {
  const asyncMock = () => vi.fn<(...args: unknown[]) => Promise<unknown>>();
  const mocks = {
    prisma: {
      withTransaction: vi.fn<(fn: (tx: TransactionClient) => Promise<unknown>) => Promise<unknown>>(
        (fn) => fn(fakeTx),
      ),
    },
    projects: {
      findById: asyncMock(),
      lockById: asyncMock().mockResolvedValue(true),
      list: asyncMock().mockResolvedValue([]),
      create: asyncMock(),
      update: asyncMock(),
      delete: asyncMock(),
    },
    ledger: {
      spentByProject: asyncMock().mockResolvedValue(new Map()),
      hasTransactionsForProject: asyncMock().mockResolvedValue(false),
      list: asyncMock().mockResolvedValue({ items: [], total: 0, limit: 50, offset: 0 }),
    },
  };
  const service = new ProjectsService(
    mocks.prisma as unknown as PrismaService,
    mocks.projects as unknown as ProjectsRepository,
    mocks.ledger as unknown as LedgerService,
  );
  return { service, mocks };
}

describe('ProjectsService', () => {
  let service: ProjectsService;
  let mocks: ReturnType<typeof build>['mocks'];

  beforeEach(() => {
    ({ service, mocks } = build());
  });

  it('lists every project with its spend read from the ledger, zero when untouched', async () => {
    const empty = { ...trip, id: 10n, name: 'Remodel', budget: null };
    mocks.projects.list.mockResolvedValue([trip, empty]);
    mocks.ledger.spentByProject.mockResolvedValue(new Map([[9n, 110000n]]));
    expect(await service.list()).toEqual([
      { project: trip, spent: 110000n },
      { project: empty, spent: 0n },
    ]);
  });

  it('creates with a budget, or with none (absent, never zero)', async () => {
    mocks.projects.create.mockResolvedValue(trip);
    expect(await service.create({ name: 'Trip to France', budget: 500000n })).toEqual({
      project: trip,
      spent: 0n,
    });
    expect(mocks.projects.create).toHaveBeenLastCalledWith({
      name: 'Trip to France',
      budget: 500000n,
    });
    await service.create({ name: 'Remodel' });
    expect(mocks.projects.create).toHaveBeenLastCalledWith({ name: 'Remodel', budget: null });
  });

  it('maps the unique-name index violation to DUPLICATE_NAME on create and rename', async () => {
    const violation = new Error(
      'duplicate key value violates unique constraint "projects_name_unique"',
    );
    mocks.projects.create.mockRejectedValue(violation);
    await expect(service.create({ name: 'Trip to France' })).rejects.toBeInstanceOf(
      DuplicateNameError,
    );
    mocks.projects.findById.mockResolvedValue(trip);
    mocks.projects.update.mockRejectedValue(violation);
    await expect(service.update(9n, { name: 'Trip to France' })).rejects.toBeInstanceOf(
      DuplicateNameError,
    );
  });

  it('removes a budget with null and reports the current spend', async () => {
    mocks.projects.findById.mockResolvedValue(trip);
    mocks.projects.update.mockResolvedValue({ ...trip, budget: null });
    mocks.ledger.spentByProject.mockResolvedValue(new Map([[9n, 30000n]]));
    expect(await service.update(9n, { budget: null })).toEqual({
      project: { ...trip, budget: null },
      spent: 30000n,
    });
    expect(mocks.projects.update).toHaveBeenCalledWith(9n, { budget: null });
  });

  it('closes and reopens reversibly', async () => {
    mocks.projects.findById.mockResolvedValue(trip);
    mocks.projects.update.mockResolvedValue(trip);
    await service.setStatus(9n, 'closed');
    expect(mocks.projects.update).toHaveBeenLastCalledWith(9n, { status: 'closed' });
    await service.setStatus(9n, 'active');
    expect(mocks.projects.update).toHaveBeenLastCalledWith(9n, { status: 'active' });
  });

  it('answers 404 for a missing path id', async () => {
    mocks.projects.findById.mockResolvedValue(null);
    await expect(service.update(99n, { name: 'x' })).rejects.toBeInstanceOf(NotFoundError);
    await expect(service.setStatus(99n, 'closed')).rejects.toBeInstanceOf(NotFoundError);
    await expect(service.listTransactions(99n, {})).rejects.toBeInstanceOf(NotFoundError);
    mocks.projects.lockById.mockResolvedValue(false);
    await expect(service.remove(99n)).rejects.toBeInstanceOf(NotFoundError);
  });

  it('deletes an unused project under a row lock in one transaction', async () => {
    await service.remove(9n);
    expect(mocks.projects.lockById).toHaveBeenCalledWith(9n, fakeTx);
    expect(mocks.ledger.hasTransactionsForProject).toHaveBeenCalledWith(9n, fakeTx);
    expect(mocks.projects.delete).toHaveBeenCalledWith(9n, fakeTx);
  });

  it('rejects deleting a project any transaction row references, telling the user to close it', async () => {
    mocks.ledger.hasTransactionsForProject.mockResolvedValue(true);
    const error = await service.remove(9n).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(ProjectInUseError);
    expect((error as Error).message).toMatch(/close it instead/);
    expect(mocks.projects.delete).not.toHaveBeenCalled();
  });

  it("lists only the project's expenses through the ledger", async () => {
    mocks.projects.findById.mockResolvedValue(trip);
    await service.listTransactions(9n, { limit: 20, offset: 40 });
    expect(mocks.ledger.list).toHaveBeenCalledWith({
      projectId: 9n,
      kind: 'expense',
      limit: 20,
      offset: 40,
    });
  });
});

describe('ProjectsService.assertActive', () => {
  let service: ProjectsService;
  let mocks: ReturnType<typeof build>['mocks'];

  beforeEach(() => {
    ({ service, mocks } = build());
  });

  it('rejects a missing project as a domain rule violation, not a 404', async () => {
    mocks.projects.findById.mockResolvedValue(null);
    await expect(service.assertActive(9n)).rejects.toBeInstanceOf(DomainRuleViolationError);
  });

  it('rejects a closed project', async () => {
    mocks.projects.findById.mockResolvedValue({ ...trip, status: 'closed' });
    await expect(service.assertActive(9n)).rejects.toBeInstanceOf(ClosedProjectError);
  });

  it('accepts an active project and passes the transaction client through', async () => {
    mocks.projects.findById.mockResolvedValue(trip);
    await expect(service.assertActive(9n, fakeTx)).resolves.toBeUndefined();
    expect(mocks.projects.findById).toHaveBeenCalledWith(9n, fakeTx);
  });
});
