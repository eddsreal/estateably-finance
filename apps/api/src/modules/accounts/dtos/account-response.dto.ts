import { AccountKind } from '@prisma/client';
import { toDateOnly } from '../../../common/dates/dates';
import { AccountView } from '../services/accounts.service';

export class AccountResponseDto {
  id!: string;
  name!: string;
  kind!: AccountKind;
  openingBalance!: string;
  openingDate!: string;
  archived!: boolean;
  balance!: string;

  static from(view: AccountView): AccountResponseDto {
    return {
      id: view.row.id.toString(),
      name: view.row.name,
      kind: view.row.kind,
      openingBalance: view.openingBalance.toString(),
      openingDate: toDateOnly(view.row.openingDate),
      archived: view.row.archived,
      balance: view.balance.toString(),
    };
  }
}

export class BalanceResponseDto {
  accountId!: string;
  asOf!: string;
  balance!: string;

  static from(input: { accountId: bigint; asOf: string; balance: bigint }): BalanceResponseDto {
    return {
      accountId: input.accountId.toString(),
      asOf: input.asOf,
      balance: input.balance.toString(),
    };
  }
}

export class AccountListResponseDto {
  items!: AccountResponseDto[];
  totalBalance!: string;

  static from(list: { items: AccountView[]; totalBalance: bigint }): AccountListResponseDto {
    return {
      items: list.items.map((item) => AccountResponseDto.from(item)),
      totalBalance: list.totalBalance.toString(),
    };
  }
}
