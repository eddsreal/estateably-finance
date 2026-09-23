import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { describe, expect, it } from 'vitest';
import {
  IsDateOnly,
  isDateOnlyString,
  IsIdString,
  isIdString,
  ToBoolean,
  Trimmed,
} from './request-validation';

class Sample {
  @Trimmed()
  name?: string;

  @IsDateOnly()
  date?: string;

  @IsIdString()
  id?: string;

  @ToBoolean()
  flag: boolean = false;
}

describe('request validation helpers', () => {
  it('accepts real calendar dates only', () => {
    expect(isDateOnlyString('2026-09-10')).toBe(true);
    expect(isDateOnlyString('2026-02-30')).toBe(false);
    expect(isDateOnlyString('2026-9-1')).toBe(false);
    expect(isDateOnlyString('2026-09-10T00:00:00Z')).toBe(false);
    expect(isDateOnlyString(20260910)).toBe(false);
  });

  it('accepts decimal id strings only', () => {
    expect(isIdString('42')).toBe(true);
    expect(isIdString('0')).toBe(true);
    expect(isIdString('-1')).toBe(false);
    expect(isIdString('4.2')).toBe(false);
    expect(isIdString('')).toBe(false);
    expect(isIdString(42)).toBe(false);
  });

  it('wires the decorators into class-validator with named messages', () => {
    const instance = plainToInstance(Sample, {
      name: '  Checking  ',
      date: '2026-02-30',
      id: 'abc',
      flag: 'true',
    });
    expect(instance.name).toBe('Checking');
    expect(instance.flag).toBe(true);
    const errors = validateSync(instance);
    const failed = errors.map((error) => error.property).sort();
    expect(failed).toEqual(['date', 'id']);
  });

  it('defaults an absent boolean flag to false and rejects junk', () => {
    expect(plainToInstance(Sample, {}).flag).toBe(false);
    expect(plainToInstance(Sample, { flag: 'false' }).flag).toBe(false);
    expect(plainToInstance(Sample, { flag: 'yes' }).flag).toBe('yes');
  });
});
