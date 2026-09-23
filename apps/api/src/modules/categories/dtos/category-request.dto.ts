import { CategoryType } from '@prisma/client';
import { IsBoolean, IsIn, IsOptional, IsString, Length } from 'class-validator';
import {
  IsIdString,
  ToBoolean,
  Trimmed,
} from '../../../common/request-validation/request-validation';

export class CategoryCreateRequestDto {
  @Trimmed()
  @IsString()
  @Length(1, 60)
  name!: string;

  @IsIn(['expense', 'income'])
  type!: CategoryType;
}

export class CategoryUpdateRequestDto {
  @Trimmed()
  @IsString()
  @Length(1, 60)
  name!: string;

  @IsOptional()
  @IsIn(['expense', 'income'])
  type?: CategoryType;
}

export class IncludeArchivedQueryDto {
  @ToBoolean()
  @IsBoolean()
  includeArchived: boolean = false;
}

export class IdParamDto {
  @IsIdString()
  id!: string;
}
