import { describe, expect, it } from 'vitest';
import { AccountView } from '../services/accounts.service';
import {
  AccountListResponseDto,
  AccountResponseDto,
  BalanceResponseDto,
} from './account-response.dto';

function view(overrides: Partial<AccountView> = {}): AccountView {
  return {
    row: {
      id: 1n,
      name: 'Checking',
      kind: 'bank',
      openingDate: new Date('2026-09-01T00:00:00Z'),
      archived: false,
    },
    openingBalance: 150000n,
    balance: 445750n,
    ...overrides,
  } as AccountView;
}

describe('AccountResponseDto.from', () => {
  it('serializes ids, money and the opening date as strings', () => {
    expect(AccountResponseDto.from(view())).toEqual({
      id: '1',
      name: 'Checking',
      kind: 'bank',
      openingBalance: '150000',
      openingDate: '2026-09-01',
      archived: false,
      balance: '445750',
    });
  });

  it('keeps signed money exact at the ±10^15 guard limits', () => {
    const limit = 10n ** 15n;
    const dto = AccountResponseDto.from(view({ openingBalance: -limit, balance: limit }));
    expect(dto.openingBalance).toBe('-1000000000000000');
    expect(dto.balance).toBe('1000000000000000');
  });
});

describe('AccountListResponseDto.from', () => {
  it('serializes the items and the non-archived total', () => {
    const dto = AccountListResponseDto.from({ items: [view()], totalBalance: -50000n });
    expect(dto.items).toHaveLength(1);
    expect(dto.totalBalance).toBe('-50000');
  });
});

describe('BalanceResponseDto.from', () => {
  it('serializes the account id, date and balance as strings', () => {
    expect(
      BalanceResponseDto.from({ accountId: 1n, asOf: '2026-09-12', balance: 145750n }),
    ).toEqual({ accountId: '1', asOf: '2026-09-12', balance: '145750' });
  });

  it('keeps signed balances exact at the ±10^15 guard limits and answers "0" for zero', () => {
    const limit = 10n ** 15n;
    expect(
      BalanceResponseDto.from({ accountId: 2n, asOf: '2026-08-15', balance: -limit }).balance,
    ).toBe('-1000000000000000');
    expect(
      BalanceResponseDto.from({ accountId: 2n, asOf: '2026-08-15', balance: 0n }).balance,
    ).toBe('0');
  });
});
