import { IsIn, IsOptional, IsString, Length } from 'class-validator';
import { IsMoney } from '../../../common/money.decorator/money.decorator';
import {
  IsDateOnly,
  IsIdString,
  Trimmed,
} from '../../../common/request-validation/request-validation';

export class IdParamDto {
  @IsIdString()
  id!: string;
}

export class ScheduledItemRequestDto {
  @IsIn(['bill', 'income'])
  kind!: 'bill' | 'income';

  @Trimmed()
  @IsString()
  @Length(1, 120)
  description!: string;

  @IsMoney({ positive: true })
  amount!: string;

  @IsIdString()
  accountId!: string;

  @IsIdString()
  categoryId!: string;

  @IsDateOnly()
  nextDueDate!: string;

  @IsIn(['once', 'weekly', 'monthly'])
  recurrence!: 'once' | 'weekly' | 'monthly';

  @IsOptional()
  @IsDateOnly()
  endDate?: string;
}

export class ConfirmScheduledItemRequestDto {
  @IsMoney({ positive: true })
  amount!: string;

  @IsDateOnly()
  date!: string;

  @IsIdString()
  accountId!: string;

  @IsIdString()
  categoryId!: string;

  @Trimmed()
  @IsString()
  @Length(1, 120)
  description!: string;
}

export class ProjectionQueryDto {
  @IsDateOnly()
  horizon!: string;
}
