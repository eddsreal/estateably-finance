import { Injectable } from '@nestjs/common';
import { Account, AccountKind } from '@prisma/client';
import { addMonthsClamped, appToday, toDate, toDateOnly } from '../../../common/dates/dates';
import {
  ArchivedAccountError,
  DomainRuleViolationError,
  DuplicateNameError,
  NotFoundError,
  ValidationFailedError,
} from '../../../common/domain-errors/domain-errors';
import {
  isUniqueViolation,
  PrismaService,
  TransactionClient,
} from '../../../common/prisma.service/prisma.service';
import { LedgerService, TransactionWithEntries } from '../../ledger/services/ledger.service';
import { AccountsRepository } from '../repositories/accounts.repository';

const NAME_INDEX = 'accounts_name_unique';
const OPENING_DESCRIPTION = 'Opening balance';

export type AccountView = { row: Account; openingBalance: bigint; balance: bigint };

export type CreateAccountInput = {
  name: string;
  kind: AccountKind;
  openingBalance: bigint;
  openingDate: string;
};

export type UpdateAccountInput = Partial<CreateAccountInput>;

export type BalanceHistory = {
  from: string;
  to: string;
  total: bigint[];
  accounts: { accountId: bigint; archived: boolean; balances: bigint[] }[];
};

const DAY_MS = 86_400_000;

function openingAmountOf(transaction: TransactionWithEntries): bigint {
  const entry = transaction.entries.find((candidate) => candidate.accountId !== null);
  return entry?.amount ?? 0n;
}

@Injectable()
export class AccountsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly accounts: AccountsRepository,
    private readonly ledger: LedgerService,
  ) {}

  private async mapUnique<T>(name: string, work: () => Promise<T>): Promise<T> {
    try {
      return await work();
    } catch (error) {
      if (isUniqueViolation(error, NAME_INDEX)) throw new DuplicateNameError('account', name);
      throw error;
    }
  }

  create(input: CreateAccountInput): Promise<AccountView> {
    return this.mapUnique(input.name, () =>
      this.prisma.withTransaction(async (tx) => {
        const row = await this.accounts.create(
          { name: input.name, kind: input.kind, openingDate: input.openingDate },
          tx,
        );
        if (input.openingBalance !== 0n) {
          await this.ledger.record(
            {
              kind: 'opening',
              amount: input.openingBalance,
              accountId: row.id,
              date: input.openingDate,
              description: OPENING_DESCRIPTION,
            },
            tx,
          );
        }
        return { row, openingBalance: input.openingBalance, balance: input.openingBalance };
      }),
    );
  }

  async update(id: bigint, patch: UpdateAccountInput): Promise<AccountView> {
    const existing = await this.accounts.findById(id);
    if (!existing) throw new NotFoundError('Account', id);
    if (
      patch.name === undefined &&
      patch.kind === undefined &&
      patch.openingBalance === undefined &&
      patch.openingDate === undefined
    ) {
      throw new ValidationFailedError([
        { field: 'body', message: 'at least one property must be present' },
      ]);
    }
    return this.mapUnique(patch.name ?? existing.name, () =>
      this.prisma.withTransaction(async (tx) => {
        const row = await this.accounts.update(
          id,
          { name: patch.name, kind: patch.kind, openingDate: patch.openingDate },
          tx,
        );
        const opening = await this.ledger.findOpening(id, tx);
        const currentAmount = opening ? openingAmountOf(opening) : 0n;
        const newAmount = patch.openingBalance ?? currentAmount;
        const newDate = patch.openingDate ?? toDateOnly(row.openingDate);
        if (opening && newAmount === 0n) {
          await this.ledger.softDelete(opening.id, tx);
        } else if (
          opening &&
          (newAmount !== currentAmount || newDate !== toDateOnly(opening.date))
        ) {
          await this.ledger.update(
            opening.id,
            {
              kind: 'opening',
              amount: newAmount,
              accountId: id,
              date: newDate,
              description: opening.description,
            },
            tx,
          );
        } else if (!opening && newAmount !== 0n) {
          await this.ledger.record(
            {
              kind: 'opening',
              amount: newAmount,
              accountId: id,
              date: newDate,
              description: OPENING_DESCRIPTION,
            },
            tx,
          );
        }
        return {
          row,
          openingBalance: newAmount,
          balance: await this.ledger.currentBalance(id, tx),
        };
      }),
    );
  }

  async assertUsable(id: bigint, field: string, tx?: TransactionClient): Promise<void> {
    const row = await this.accounts.findById(id, tx);
    if (!row) {
      throw new DomainRuleViolationError(`Account ${id} does not exist`, [
        { field, message: 'account does not exist' },
      ]);
    }
    if (row.archived) throw new ArchivedAccountError(field, id);
  }

  async balanceAsOf(id: bigint, asOf: string): Promise<bigint> {
    const existing = await this.accounts.findById(id);
    if (!existing) throw new NotFoundError('Account', id);
    return this.ledger.balanceAsOf(id, asOf);
  }

  async setArchived(id: bigint, archived: boolean): Promise<AccountView> {
    const existing = await this.accounts.findById(id);
    if (!existing) throw new NotFoundError('Account', id);
    return this.view(await this.accounts.setArchived(id, archived));
  }

  async list(includeArchived: boolean): Promise<{ items: AccountView[]; totalBalance: bigint }> {
    const rows = await this.accounts.list(includeArchived);
    const items: AccountView[] = [];
    let totalBalance = 0n;
    for (const row of rows) {
      const item = await this.view(row);
      items.push(item);
      if (!row.archived) totalBalance += item.balance;
    }
    return { items, totalBalance };
  }

  async balanceHistory(input: {
    from?: string;
    to?: string;
    includeArchived: boolean;
  }): Promise<BalanceHistory> {
    const rows = await this.accounts.list(input.includeArchived);
    const to = input.to ?? appToday();
    const from = input.from ?? (await this.defaultFrom(rows, to));
    const accounts = await Promise.all(
      rows.map(async (row) => ({
        accountId: row.id,
        archived: row.archived,
        balances: await this.ledger.balanceSeries(row.id, from, to),
      })),
    );
    const days = (toDate(to).getTime() - toDate(from).getTime()) / DAY_MS + 1;
    const total = Array.from({ length: days }, (_, i) =>
      accounts.reduce((sum, account) => (account.archived ? sum : sum + account.balances[i]), 0n),
    );
    return { from, to, total, accounts };
  }

  private async defaultFrom(rows: Account[], to: string): Promise<string> {
    const earliest = await this.ledger.earliestEntryDate(
      rows.filter((row) => !row.archived).map((row) => row.id),
    );
    if (earliest === null || earliest > to) return to;
    const floor = addMonthsClamped(to, -120);
    return earliest < floor ? floor : earliest;
  }

  private async view(row: Account): Promise<AccountView> {
    const opening = await this.ledger.findOpening(row.id);
    return {
      row,
      openingBalance: opening ? openingAmountOf(opening) : 0n,
      balance: await this.ledger.currentBalance(row.id),
    };
  }
}
