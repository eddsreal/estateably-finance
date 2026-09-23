import { IsDateOnly } from '../../../common/request-validation/request-validation';

export class NarrativeRequestDto {
  @IsDateOnly()
  from!: string;

  @IsDateOnly()
  to!: string;
}
