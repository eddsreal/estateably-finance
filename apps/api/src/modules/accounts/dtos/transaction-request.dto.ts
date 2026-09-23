import { Injectable, PipeTransform } from '@nestjs/common';
import { ClassConstructor, plainToInstance } from 'class-transformer';
import { IsIn, IsOptional, IsString, Length, validate } from 'class-validator';
import { ValidationFailedError } from '../../../common/domain-errors/domain-errors';
import { validationFailed } from '../../../common/http-exception.filter/http-exception.filter';
import { IsMoney } from '../../../common/money.decorator/money.decorator';
import {
  IsDateOnly,
  IsIdString,
  Trimmed,
} from '../../../common/request-validation/request-validation';

export class ExpenseIntentDto {
  @IsIn(['expense'])
  kind!: 'expense';

  @IsDateOnly()
  date!: string;

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

  @IsOptional()
  @IsIdString()
  projectId?: string;
}

export class IncomeIntentDto {
  @IsIn(['income'])
  kind!: 'income';

  @IsDateOnly()
  date!: string;

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
}

export class TransferIntentDto {
  @IsIn(['transfer'])
  kind!: 'transfer';

  @IsDateOnly()
  date!: string;

  @Trimmed()
  @IsString()
  @Length(1, 120)
  description!: string;

  @IsMoney({ positive: true })
  amount!: string;

  @IsIdString()
  accountId!: string;

  @IsIdString()
  counterAccountId!: string;
}

export type TransactionRequestDto = ExpenseIntentDto | IncomeIntentDto | TransferIntentDto;

const INTENT_CLASSES = {
  expense: ExpenseIntentDto,
  income: IncomeIntentDto,
  transfer: TransferIntentDto,
} as const;

@Injectable()
export class TransactionRequestPipe implements PipeTransform<
  unknown,
  Promise<TransactionRequestDto>
> {
  async transform(value: unknown): Promise<TransactionRequestDto> {
    const kind =
      typeof value === 'object' && value !== null && 'kind' in value
        ? (value as { kind: unknown }).kind
        : undefined;
    const cls =
      typeof kind === 'string' && kind in INTENT_CLASSES
        ? INTENT_CLASSES[kind as keyof typeof INTENT_CLASSES]
        : undefined;
    if (!cls) {
      throw new ValidationFailedError([
        { field: 'kind', message: 'kind must be one of expense, income, transfer' },
      ]);
    }
    const instance = plainToInstance(cls as ClassConstructor<TransactionRequestDto>, value);
    const errors = await validate(instance, { whitelist: true, forbidNonWhitelisted: true });
    if (errors.length > 0) throw validationFailed(errors);
    return instance;
  }
}
