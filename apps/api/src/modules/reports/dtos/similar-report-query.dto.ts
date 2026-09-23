import { IsDateOnly } from '../../../common/request-validation/request-validation';

export class SimilarReportQueryDto {
  @IsDateOnly()
  from!: string;

  @IsDateOnly()
  to!: string;
}
