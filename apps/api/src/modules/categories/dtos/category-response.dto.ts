import { Category, CategoryType } from '@prisma/client';

export class CategoryResponseDto {
  id!: string;
  name!: string;
  type!: CategoryType;
  archived!: boolean;

  static from(row: Category): CategoryResponseDto {
    return {
      id: row.id.toString(),
      name: row.name,
      type: row.type,
      archived: row.archived,
    };
  }
}
