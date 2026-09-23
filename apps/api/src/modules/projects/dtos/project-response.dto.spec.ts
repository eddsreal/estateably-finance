import { describe, expect, it } from 'vitest';
import { TransactionWithEntries } from '../../ledger/services/ledger.service';
import { ProjectResponseDto, ProjectTransactionPageDto } from './project-response.dto';

const project = {
  id: 9007199254740993n,
  name: 'Trip to France',
  budget: 500000n,
  status: 'active' as const,
};

describe('ProjectResponseDto.from', () => {
  it('serializes spent and remaining as strings of cents', () => {
    expect(ProjectResponseDto.from({ project, spent: 110000n })).toEqual({
      id: '9007199254740993',
      name: 'Trip to France',
      status: 'active',
      budget: '500000',
      spent: '110000',
      remaining: '390000',
      overBudget: false,
    });
  });

  it('flags over budget with a negative remaining; spent equal to budget is not over', () => {
    const over = ProjectResponseDto.from({ project, spent: 520000n });
    expect(over.overBudget).toBe(true);
    expect(over.remaining).toBe('-20000');
    expect(ProjectResponseDto.from({ project, spent: 500000n }).overBudget).toBe(false);
  });

  it('omits budget and remaining without a budget, never zero (US5 #8)', () => {
    const dto = ProjectResponseDto.from({ project: { ...project, budget: null }, spent: 4250n });
    expect(dto).not.toHaveProperty('budget');
    expect(dto).not.toHaveProperty('remaining');
    expect(dto.overBudget).toBe(false);
    expect(dto.spent).toBe('4250');
  });

  it('keeps precision at the 10^15 money limit', () => {
    const dto = ProjectResponseDto.from({
      project: { ...project, budget: 10n ** 15n },
      spent: 10n ** 15n - 1n,
    });
    expect(dto.budget).toBe('1000000000000000');
    expect(dto.remaining).toBe('1');
  });
});

describe('ProjectTransactionPageDto.from', () => {
  it('renders an expense as its absolute amount with account, category and project', () => {
    const row = {
      id: 100n,
      kind: 'expense',
      date: new Date('2026-09-10T00:00:00Z'),
      description: 'Flights',
      projectId: 9n,
      deletedAt: null,
      entries: [
        {
          id: 1n,
          transactionId: 100n,
          accountId: 3n,
          systemAccountId: null,
          amount: -80000n,
          systemAccount: null,
        },
        {
          id: 2n,
          transactionId: 100n,
          accountId: null,
          systemAccountId: 20n,
          amount: 80000n,
          systemAccount: { categoryId: 4n },
        },
      ],
    } as unknown as TransactionWithEntries;
    expect(
      ProjectTransactionPageDto.from({ items: [row], total: 1, limit: 50, offset: 0 }),
    ).toEqual({
      items: [
        {
          id: '100',
          kind: 'expense',
          date: '2026-09-10',
          description: 'Flights',
          amount: '80000',
          accountId: '3',
          categoryId: '4',
          projectId: '9',
        },
      ],
      total: 1,
      limit: 50,
      offset: 0,
    });
  });
});
