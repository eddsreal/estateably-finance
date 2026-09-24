import { TransactionKind } from '@prisma/client';
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Length, Max, Min } from 'class-validator';
import {
  IsDateOnly,
  IsIdString,
  Trimmed,
} from '../../../common/request-validation/request-validation';

export class TransactionListQueryDto {
  @IsOptional()
  @IsIdString()
  accountId?: string;

  @IsOptional()
  @IsIn(['expense', 'income', 'transfer', 'opening'])
  kind?: TransactionKind;

  @IsOptional()
  @IsIdString()
  categoryId?: string;

  @IsOptional()
  @IsIdString()
  projectId?: string;

  @IsOptional()
  @IsDateOnly()
  from?: string;

  @IsOptional()
  @IsDateOnly()
  to?: string;

  @IsOptional()
  @Trimmed()
  @IsString()
  @Length(1, 60)
  q?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  limit?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  offset?: number;
}
