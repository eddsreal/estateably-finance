import { describe, expect, it } from 'vitest';
import { BalanceHistoryResponseDto } from './balance-history-response.dto';

describe('BalanceHistoryResponseDto.from', () => {
  it('serializes every balance and id as a string, never a JSON number', () => {
    const dto = BalanceHistoryResponseDto.from({
      from: '2026-09-22',
      to: '2026-09-24',
      total: [395750n, 0n, -4250n],
      accounts: [
        { accountId: 1n, archived: false, balances: [445750n, 0n, -4250n] },
        { accountId: 7n, archived: true, balances: [-(10n ** 15n), 1n, 0n] },
      ],
    });
    expect(dto).toEqual({
      from: '2026-09-22',
      to: '2026-09-24',
      total: ['395750', '0', '-4250'],
      accounts: [
        { accountId: '1', archived: false, balances: ['445750', '0', '-4250'] },
        { accountId: '7', archived: true, balances: ['-1000000000000000', '1', '0'] },
      ],
    });
    const json = JSON.stringify(dto);
    expect(json).not.toMatch(/[[,:]-?\d/);
  });

  it('serializes no accounts as empty arrays', () => {
    expect(
      BalanceHistoryResponseDto.from({
        from: '2026-09-24',
        to: '2026-09-24',
        total: [0n],
        accounts: [],
      }),
    ).toEqual({ from: '2026-09-24', to: '2026-09-24', total: ['0'], accounts: [] });
  });
});
