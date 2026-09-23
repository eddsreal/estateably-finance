import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Length, Max, Min, ValidateIf } from 'class-validator';
import { IsMoney } from '../../../common/money.decorator/money.decorator';
import { IsIdString, Trimmed } from '../../../common/request-validation/request-validation';

export class ProjectCreateRequestDto {
  @Trimmed()
  @IsString()
  @Length(1, 60)
  name!: string;

  @ValidateIf((dto: ProjectCreateRequestDto) => dto.budget !== undefined)
  @IsMoney({ positive: true })
  budget?: string;
}

export class ProjectUpdateRequestDto {
  @ValidateIf((dto: ProjectUpdateRequestDto) => dto.name !== undefined || dto.budget === undefined)
  @Trimmed()
  @IsString()
  @Length(1, 60)
  name?: string;

  @IsOptional()
  @IsMoney({ positive: true })
  budget?: string | null;
}

export class IdParamDto {
  @IsIdString()
  id!: string;
}

export class PageQueryDto {
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
