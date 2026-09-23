import { Category } from '@prisma/client';
import { describe, expect, it } from 'vitest';
import { CategoryResponseDto } from './category-response.dto';

describe('CategoryResponseDto.from', () => {
  it('serializes the bigint id as a decimal string and copies the rest', () => {
    const row: Category = {
      id: 9007199254740993n,
      name: 'Groceries',
      type: 'expense',
      archived: false,
    };
    expect(CategoryResponseDto.from(row)).toEqual({
      id: '9007199254740993',
      name: 'Groceries',
      type: 'expense',
      archived: false,
    });
  });
});
