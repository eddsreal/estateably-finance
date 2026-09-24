import { BalanceHistory } from '../services/accounts.service';

export class AccountBalanceSeriesDto {
  accountId!: string;
  archived!: boolean;
  balances!: string[];
}

export class BalanceHistoryResponseDto {
  from!: string;
  to!: string;
  total!: string[];
  accounts!: AccountBalanceSeriesDto[];

  static from(history: BalanceHistory): BalanceHistoryResponseDto {
    return {
      from: history.from,
      to: history.to,
      total: history.total.map((value) => value.toString()),
      accounts: history.accounts.map((account) => ({
        accountId: account.accountId.toString(),
        archived: account.archived,
        balances: account.balances.map((value) => value.toString()),
      })),
    };
  }
}
