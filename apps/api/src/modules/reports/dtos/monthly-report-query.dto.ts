import { Matches } from 'class-validator';

export class MonthlyReportQueryDto {
  @Matches(/^[0-9]{4}-(0[1-9]|1[0-2])$/, {
    message: 'month must be a calendar month formatted YYYY-MM',
  })
  month!: string;
}
