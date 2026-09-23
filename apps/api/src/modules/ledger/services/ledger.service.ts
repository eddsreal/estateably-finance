import { Injectable } from '@nestjs/common';
import { NotFoundError, OpeningKindChangeError } from '../../../common/domain-errors/domain-errors';
import { PrismaService, TransactionClient } from '../../../common/prisma.service/prisma.service';
import { balanceAt } from '../domain/balance-at';
import { LedgerIntent, toEntries } from '../domain/to-entries';
import { BalanceSnapshotsRepository } from '../repositories/balance-snapshots.repository';
import { EntriesRepository } from '../repositories/entries.repository';
import { SystemAccountsRepository } from '../repositories/system-accounts.repository';
import {
  TransactionFilters,
  TransactionsRepository,
  TransactionWithEntries,
} from '../repositories/transactions.repository';

export type { TransactionFilters, TransactionWithEntries };

export type TransactionIntentInput =
  | { kind: 'expense'; amount: bigint; accountId: bigint; categoryId: bigint; projectId?: bigint }
  | { kind: 'income'; amount: bigint; accountId: bigint; categoryId: bigint }
  | { kind: 'transfer'; amount: bigint; accountId: bigint; counterAccountId: bigint }
  | { kind: 'opening'; amount: bigint; accountId: bigint };

export type RecordTransactionInput = { date: string; description: string } & TransactionIntentInput;

export type ListTransactionsInput = TransactionFilters & { limit?: number; offset?: number };

export type TransactionPage = {
  items: TransactionWithEntries[];
  total: number;
  limit: number;
  offset: number;
};

@Injectable()
export class LedgerService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly transactions: TransactionsRepository,
    private readonly entries: EntriesRepository,
    private readonly systemAccounts: SystemAccountsRepository,
    private readonly snapshots: BalanceSnapshotsRepository,
  ) {}

  private run<T>(
    tx: TransactionClient | undefined,
    fn: (tx: TransactionClient) => Promise<T>,
  ): Promise<T> {
    return tx ? fn(tx) : this.prisma.withTransaction(fn);
  }

  private async resolveIntent(
    input: RecordTransactionInput,
    tx: TransactionClient,
  ): Promise<LedgerIntent> {
    switch (input.kind) {
      case 'expense':
      case 'income': {
        const systemAccount = await this.systemAccounts.findByCategoryId(input.categoryId, tx);
        if (!systemAccount) throw new NotFoundError('Category', input.categoryId);
        return {
          kind: input.kind,
          amount: input.amount,
          accountId: input.accountId,
          categorySystemAccountId: systemAccount.id,
        };
      }
      case 'transfer':
        return {
          kind: 'transfer',
          amount: input.amount,
          accountId: input.accountId,
          counterAccountId: input.counterAccountId,
        };
      case 'opening': {
        const equity = await this.systemAccounts.findEquity(tx);
        if (!equity) throw new NotFoundError('SystemAccount', 'equity');
        return {
          kind: 'opening',
          amount: input.amount,
          accountId: input.accountId,
          equitySystemAccountId: equity.id,
        };
      }
    }
  }

  private async applyDeltas(
    entries: readonly { accountId: bigint | null; amount: bigint }[],
    sign: 1n | -1n,
    tx: TransactionClient,
  ): Promise<void> {
    for (const entry of entries) {
      if (entry.accountId !== null) {
        await this.snapshots.applyDelta(entry.accountId, sign * entry.amount, tx);
      }
    }
  }

  record(input: RecordTransactionInput, tx?: TransactionClient): Promise<TransactionWithEntries> {
    return this.run(tx, async (client) => {
      const drafts = toEntries(await this.resolveIntent(input, client));
      const row = await this.transactions.create(
        {
          kind: input.kind,
          date: input.date,
          description: input.description,
          projectId: input.kind === 'expense' ? input.projectId : undefined,
        },
        drafts,
        client,
      );
      await this.applyDeltas(drafts, 1n, client);
      return row;
    });
  }

  update(
    id: bigint,
    input: RecordTransactionInput,
    tx?: TransactionClient,
  ): Promise<TransactionWithEntries> {
    return this.run(tx, async (client) => {
      const existing = await this.transactions.findLiveById(id, client);
      if (!existing) throw new NotFoundError('Transaction', id);
      if ((existing.kind === 'opening') !== (input.kind === 'opening')) {
        throw new OpeningKindChangeError();
      }
      const drafts = toEntries(await this.resolveIntent(input, client));
      await this.applyDeltas(existing.entries, -1n, client);
      await this.entries.deleteByTransaction(id, client);
      const row = await this.transactions.replaceIntent(
        id,
        {
          kind: input.kind,
          date: input.date,
          description: input.description,
          projectId: input.kind === 'expense' ? input.projectId : undefined,
        },
        drafts,
        client,
      );
      await this.applyDeltas(drafts, 1n, client);
      return row;
    });
  }

  softDelete(id: bigint, tx?: TransactionClient): Promise<void> {
    return this.run(tx, async (client) => {
      const existing = await this.transactions.findLiveById(id, client);
      if (!existing) throw new NotFoundError('Transaction', id);
      await this.transactions.softDelete(id, client);
      await this.applyDeltas(existing.entries, -1n, client);
    });
  }

  async list(input: ListTransactionsInput): Promise<TransactionPage> {
    const limit = input.limit ?? 50;
    const offset = input.offset ?? 0;
    const { items, total } = await this.transactions.list(input, limit, offset);
    return { items, total, limit, offset };
  }

  listAll(filters: TransactionFilters): Promise<TransactionWithEntries[]> {
    return this.transactions.listAll(filters);
  }

  findLive(id: bigint, tx?: TransactionClient): Promise<TransactionWithEntries | null> {
    return this.transactions.findLiveById(id, tx);
  }

  findOpening(accountId: bigint, tx?: TransactionClient): Promise<TransactionWithEntries | null> {
    return this.transactions.findOpeningByAccount(accountId, tx);
  }

  hasEntriesForCategory(categoryId: bigint, tx?: TransactionClient): Promise<boolean> {
    return this.entries.existsForCategory(categoryId, tx);
  }

  hasTransactionsForProject(projectId: bigint, tx?: TransactionClient): Promise<boolean> {
    return this.transactions.existsForProject(projectId, tx);
  }

  spentByProject(tx?: TransactionClient): Promise<Map<bigint, bigint>> {
    return this.entries.spentByProject(tx);
  }

  async currentBalance(accountId: bigint, tx?: TransactionClient): Promise<bigint> {
    return (await this.snapshots.get(accountId, tx)) ?? 0n;
  }

  async balanceAsOf(accountId: bigint, asOf: string): Promise<bigint> {
    return balanceAt(await this.entries.listForAccount(accountId), asOf);
  }

  createCategorySystemAccount(categoryId: bigint, tx?: TransactionClient): Promise<{ id: bigint }> {
    return this.systemAccounts.createForCategory(categoryId, tx);
  }
}
