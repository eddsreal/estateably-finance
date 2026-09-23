import { Injectable } from '@nestjs/common';
import { appToday, spanExceedsMonths } from '../../../common/dates/dates';
import {
  ArchivedAccountError,
  DateRangeError,
  DomainRuleViolationError,
  FutureDateError,
  NotFoundError,
  SameAccountTransferError,
} from '../../../common/domain-errors/domain-errors';
import { PrismaService, TransactionClient } from '../../../common/prisma.service/prisma.service';
import { CategoriesService } from '../../categories/services/categories.service';
import {
  LedgerService,
  ListTransactionsInput,
  TransactionPage,
  TransactionWithEntries,
} from '../../ledger/services/ledger.service';
import { ProjectsService } from '../../projects/services/projects.service';
import { AccountsRepository } from '../repositories/accounts.repository';

export type UserTransactionInput = { date: string; description: string } & (
  | { kind: 'expense'; amount: bigint; accountId: bigint; categoryId: bigint; projectId?: bigint }
  | { kind: 'income'; amount: bigint; accountId: bigint; categoryId: bigint }
  | { kind: 'transfer'; amount: bigint; accountId: bigint; counterAccountId: bigint }
);

@Injectable()
export class TransactionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly accounts: AccountsRepository,
    private readonly categories: CategoriesService,
    private readonly projects: ProjectsService,
    private readonly ledger: LedgerService,
  ) {}

  private async assertAccountUsable(
    accountId: bigint,
    field: string,
    tx: TransactionClient,
  ): Promise<void> {
    const row = await this.accounts.findById(accountId, tx);
    if (!row) {
      throw new DomainRuleViolationError(`Account ${accountId} does not exist`, [
        { field, message: 'account does not exist' },
      ]);
    }
    if (row.archived) throw new ArchivedAccountError(field, accountId);
  }

  private async validate(input: UserTransactionInput, tx: TransactionClient): Promise<void> {
    if (input.date > appToday()) throw new FutureDateError();
    await this.assertAccountUsable(input.accountId, 'accountId', tx);
    switch (input.kind) {
      case 'transfer':
        if (input.counterAccountId === input.accountId) throw new SameAccountTransferError();
        await this.assertAccountUsable(input.counterAccountId, 'counterAccountId', tx);
        break;
      case 'expense':
        await this.categories.assertUsable(input.categoryId, 'expense', tx);
        if (input.projectId !== undefined) await this.projects.assertActive(input.projectId, tx);
        break;
      case 'income':
        await this.categories.assertUsable(input.categoryId, 'income', tx);
        break;
    }
  }

  record(input: UserTransactionInput, tx?: TransactionClient): Promise<TransactionWithEntries> {
    return this.run(tx, async (client) => {
      await this.validate(input, client);
      return this.ledger.record(input, client);
    });
  }

  update(
    id: bigint,
    input: UserTransactionInput,
    tx?: TransactionClient,
  ): Promise<TransactionWithEntries> {
    return this.run(tx, async (client) => {
      await this.validate(input, client);
      return this.ledger.update(id, input, client);
    });
  }

  async remove(id: bigint): Promise<void> {
    const existing = await this.ledger.findLive(id);
    if (!existing) throw new NotFoundError('Transaction', id);
    if (existing.kind === 'opening') {
      throw new DomainRuleViolationError(
        "An opening transaction is deleted by setting its account's opening balance to zero",
      );
    }
    await this.ledger.softDelete(id);
  }

  async list(input: ListTransactionsInput): Promise<TransactionPage> {
    if (input.from !== undefined && input.to !== undefined) {
      if (input.from > input.to) {
        throw new DateRangeError('the range must start on or before its end');
      }
      if (spanExceedsMonths(input.from, input.to, 24)) {
        throw new DateRangeError('the range must span at most 24 months');
      }
    }
    return this.ledger.list(input);
  }

  private run<T>(
    tx: TransactionClient | undefined,
    fn: (tx: TransactionClient) => Promise<T>,
  ): Promise<T> {
    return tx ? fn(tx) : this.prisma.withTransaction(fn);
  }
}
