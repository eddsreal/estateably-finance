import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ClosedProjectError,
  DomainRuleViolationError,
} from '../../../common/domain-errors/domain-errors';
import { TransactionClient } from '../../../common/prisma.service/prisma.service';
import { ProjectsRepository } from '../repositories/projects.repository';
import { ProjectsService } from './projects.service';

const fakeTx = { fake: true } as unknown as TransactionClient;

describe('ProjectsService.assertActive', () => {
  let findById: ReturnType<typeof vi.fn>;
  let service: ProjectsService;

  beforeEach(() => {
    findById = vi.fn<(...args: unknown[]) => Promise<unknown>>();
    service = new ProjectsService({ findById } as unknown as ProjectsRepository);
  });

  it('rejects a missing project as a domain rule violation, not a 404', async () => {
    findById.mockResolvedValue(null);
    await expect(service.assertActive(9n)).rejects.toBeInstanceOf(DomainRuleViolationError);
  });

  it('rejects a closed project', async () => {
    findById.mockResolvedValue({ id: 9n, status: 'closed' });
    await expect(service.assertActive(9n)).rejects.toBeInstanceOf(ClosedProjectError);
  });

  it('accepts an active project and passes the transaction client through', async () => {
    findById.mockResolvedValue({ id: 9n, status: 'active' });
    await expect(service.assertActive(9n, fakeTx)).resolves.toBeUndefined();
    expect(findById).toHaveBeenCalledWith(9n, fakeTx);
  });
});
