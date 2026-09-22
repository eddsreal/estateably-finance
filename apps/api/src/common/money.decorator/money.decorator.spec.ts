import { validateSync } from 'class-validator';
import { describe, expect, it } from 'vitest';
import { IsMoney, parseMoney } from './money.decorator';

class SignedDto {
  @IsMoney()
  amount!: string;
}

class PositiveDto {
  @IsMoney({ positive: true })
  amount!: string;
}

function errorsOf(dto: SignedDto | PositiveDto): string[] {
  return validateSync(dto).flatMap((e) => Object.values(e.constraints ?? {}));
}

function signed(value: unknown): string[] {
  const dto = new SignedDto();
  dto.amount = value as string;
  return errorsOf(dto);
}

function positive(value: unknown): string[] {
  const dto = new PositiveDto();
  dto.amount = value as string;
  return errorsOf(dto);
}

describe('parseMoney', () => {
  it('parses valid strings to bigint cents', () => {
    expect(parseMoney('4250')).toBe(4250n);
    expect(parseMoney('-12000')).toBe(-12000n);
    expect(parseMoney('0')).toBe(0n);
  });

  it('accepts exactly the ±10^15 guard limits and rejects one past them', () => {
    expect(parseMoney('1000000000000000')).toBe(10n ** 15n);
    expect(parseMoney('-1000000000000000')).toBe(-(10n ** 15n));
    expect(parseMoney('1000000000000001')).toBeUndefined();
    expect(parseMoney('-1000000000000001')).toBeUndefined();
  });

  it('rejects everything that is not a plain decimal string of cents', () => {
    for (const bad of [
      '1.50',
      '$42',
      '1,234',
      '+5',
      '',
      ' 42',
      '42 ',
      '4e2',
      'abc',
      42,
      42n,
      null,
    ]) {
      expect(parseMoney(bad)).toBeUndefined();
    }
    expect(parseMoney('12345678901234567')).toBeUndefined();
  });

  it('applies the positive rule on top of the guard', () => {
    expect(parseMoney('1', { positive: true })).toBe(1n);
    expect(parseMoney('0', { positive: true })).toBeUndefined();
    expect(parseMoney('-1', { positive: true })).toBeUndefined();
  });
});

describe('IsMoney', () => {
  it('passes valid signed and positive values through class-validator', () => {
    expect(signed('-1000000000000000')).toEqual([]);
    expect(signed('0')).toEqual([]);
    expect(positive('4250')).toEqual([]);
  });

  it('reports the guard message on out-of-range values', () => {
    expect(signed('1000000000000001')).toEqual([
      'amount must be a string of integer cents with absolute value at most 10^15',
    ]);
  });

  it('reports the positive message on zero and negatives', () => {
    const expected = ['amount must be a positive integer number of cents'];
    expect(positive('0')).toEqual(expected);
    expect(positive('-4250')).toEqual(expected);
  });
});
