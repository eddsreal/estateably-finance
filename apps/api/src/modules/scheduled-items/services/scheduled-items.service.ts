import { Injectable } from '@nestjs/common';
import { addMonthsClamped, appToday, toDateOnly } from '../../../common/dates/dates';
import {
  DomainRuleViolationError,
  NotFoundError,
  ValidationFailedError,
} from '../../../common/domain-errors/domain-errors';
import { PrismaService, TransactionClient } from '../../../common/prisma.service/prisma.service';
import { AccountsService } from '../../accounts/services/accounts.service';
import { TransactionsService } from '../../accounts/services/transactions.service';
import { CategoriesService } from '../../categories/services/categories.service';
import { TransactionWithEntries } from '../../ledger/services/ledger.service';
import { buildProjection, Projection } from '../domain/projection';
import { advance, missedPeriods, RecurrenceRule } from '../domain/recurrence';
import {
  ScheduledItemData,
  ScheduledItemsRepository,
  ScheduledItemWithAccount,
} from '../repositories/scheduled-items.repository';

export type ScheduledItemInput = {
  kind: 'bill' | 'income';
  description: string;
  amount: bigint;
  accountId: bigint;
  categoryId: bigint;
  nextDueDate: string;
  recurrence: RecurrenceRule;
  endDate?: string;
};

export type ConfirmInput = {
  amount: bigint;
  date: string;
  accountId: bigint;
  categoryId: bigint;
  description: string;
};

export type ScheduledItemView = {
  row: ScheduledItemWithAccount;
  overdue: boolean;
  overdueCount: number;
};

export type ProjectionView = Projection & { horizon: string };

@Injectable()
export class ScheduledItemsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly items: ScheduledItemsRepository,
    private readonly accounts: AccountsService,
    private readonly transactions: TransactionsService,
    private readonly categories: CategoriesService,
  ) {}

  private view(row: ScheduledItemWithAccount): ScheduledItemView {
    const overdueCount = missedPeriods(
      {
        nextDueDate: toDateOnly(row.nextDueDate),
        recurrence: row.recurrence,
        endDate: row.endDate === null ? null : toDateOnly(row.endDate),
      },
      appToday(),
    );
    return { row, overdue: overdueCount > 0, overdueCount };
  }

  private async validate(
    input: ScheduledItemInput,
    allowPastDue: boolean,
    tx: TransactionClient,
  ): Promise<void> {
    if (!allowPastDue && input.nextDueDate < appToday()) {
      throw new DomainRuleViolationError('The next due date cannot be in the past when creating', [
        { field: 'nextDueDate', message: 'must be today or later' },
      ]);
    }
    if (input.endDate !== undefined && input.endDate < input.nextDueDate) {
      throw new DomainRuleViolationError('The end date cannot be before the next due date', [
        { field: 'endDate', message: 'must be on or after nextDueDate' },
      ]);
    }
    await this.accounts.assertUsable(input.accountId, 'accountId', tx);
    await this.categories.assertUsable(
      input.categoryId,
      input.kind === 'bill' ? 'expense' : 'income',
      tx,
    );
  }

  create(input: ScheduledItemInput): Promise<ScheduledItemView> {
    return this.prisma.withTransaction(async (tx) => {
      await this.validate(input, false, tx);
      return this.view(await this.items.create(input as ScheduledItemData, tx));
    });
  }

  update(id: bigint, input: ScheduledItemInput): Promise<ScheduledItemView> {
    return this.prisma.withTransaction(async (tx) => {
      const existing = await this.items.findById(id, tx);
      if (!existing) throw new NotFoundError('Scheduled item', id);
      await this.validate(input, true, tx);
      return this.view(await this.items.replace(id, input as ScheduledItemData, tx));
    });
  }

  async remove(id: bigint): Promise<void> {
    const existing = await this.items.findById(id);
    if (!existing) throw new NotFoundError('Scheduled item', id);
    await this.items.delete(id);
  }

  async list(): Promise<ScheduledItemView[]> {
    return (await this.items.listActive()).map((row) => this.view(row));
  }

  confirm(
    id: bigint,
    input: ConfirmInput,
  ): Promise<{ transaction: TransactionWithEntries; item: ScheduledItemView }> {
    return this.prisma.withTransaction(async (tx) => {
      const item = await this.items.findById(id, tx);
      if (!item) throw new NotFoundError('Scheduled item', id);
      if (item.status === 'completed') {
        throw new DomainRuleViolationError(`Scheduled item ${id} is already completed`);
      }
      const transaction = await this.transactions.record(
        {
          kind: item.kind === 'bill' ? 'expense' : 'income',
          amount: input.amount,
          accountId: input.accountId,
          categoryId: input.categoryId,
          date: input.date,
          description: input.description,
        },
        tx,
      );
      const next = advance(toDateOnly(item.nextDueDate), item.recurrence);
      const completed = next === null || (item.endDate !== null && next > toDateOnly(item.endDate));
      const updated = await this.items.setAdvanced(
        id,
        completed ? { status: 'completed' } : { nextDueDate: next as string },
        tx,
      );
      return { transaction, item: this.view(updated) };
    });
  }

  async projection(horizon: string): Promise<ProjectionView> {
    const today = appToday();
    if (horizon > addMonthsClamped(today, 24)) {
      throw new ValidationFailedError([
        { field: 'horizon', message: 'must be at most 24 months after today' },
      ]);
    }
    const { totalBalance } = await this.accounts.list(false);
    const rows = await this.items.listActive();
    const projection = buildProjection(
      totalBalance,
      rows.map((row) => ({
        id: row.id,
        kind: row.kind,
        description: row.description,
        amount: row.amount,
        nextDueDate: toDateOnly(row.nextDueDate),
        recurrence: row.recurrence,
        endDate: row.endDate === null ? null : toDateOnly(row.endDate),
      })),
      today,
      horizon,
    );
    return { horizon, ...projection };
  }
}
