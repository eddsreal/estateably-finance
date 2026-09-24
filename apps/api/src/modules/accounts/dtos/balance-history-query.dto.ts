import { Injectable, PipeTransform } from '@nestjs/common';
import { IsOptional } from 'class-validator';
import { appToday, spanExceedsMonths } from '../../../common/dates/dates';
import { ValidationFailedError } from '../../../common/domain-errors/domain-errors';
import { IsDateOnly } from '../../../common/request-validation/request-validation';
import { IncludeArchivedQueryDto } from './account-request.dto';

export class BalanceHistoryQueryDto extends IncludeArchivedQueryDto {
  @IsOptional()
  @IsDateOnly()
  from?: string;

  @IsOptional()
  @IsDateOnly()
  to?: string;
}

@Injectable()
export class BalanceHistoryQueryPipe implements PipeTransform<
  BalanceHistoryQueryDto,
  BalanceHistoryQueryDto
> {
  transform(query: BalanceHistoryQueryDto): BalanceHistoryQueryDto {
    const today = appToday();
    const to = query.to ?? today;
    if (to > today) {
      throw new ValidationFailedError([{ field: 'to', message: 'must not be after today' }]);
    }
    if (query.from !== undefined) {
      if (query.from > to) {
        throw new ValidationFailedError([{ field: 'from', message: 'must not be after to' }]);
      }
      if (spanExceedsMonths(query.from, to, 120)) {
        throw new ValidationFailedError([
          { field: 'from', message: 'the span must not exceed 10 years' },
        ]);
      }
    }
    return query;
  }
}
