import { AccountKind } from '@prisma/client';
import { IsBoolean, IsIn, IsOptional, IsString, Length } from 'class-validator';
import { IsMoney } from '../../../common/money.decorator/money.decorator';
import {
  IsDateOnly,
  IsIdString,
  IsTodayOrEarlier,
  ToBoolean,
  Trimmed,
} from '../../../common/request-validation/request-validation';

export class AccountCreateRequestDto {
  @Trimmed()
  @IsString()
  @Length(1, 60)
  name!: string;

  @IsIn(['bank', 'cash', 'card'])
  kind!: AccountKind;

  @IsMoney()
  openingBalance!: string;

  @IsDateOnly()
  @IsTodayOrEarlier()
  openingDate!: string;
}

export class AccountUpdateRequestDto {
  @IsOptional()
  @Trimmed()
  @IsString()
  @Length(1, 60)
  name?: string;

  @IsOptional()
  @IsIn(['bank', 'cash', 'card'])
  kind?: AccountKind;

  @IsOptional()
  @IsMoney()
  openingBalance?: string;

  @IsOptional()
  @IsDateOnly()
  @IsTodayOrEarlier()
  openingDate?: string;
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
