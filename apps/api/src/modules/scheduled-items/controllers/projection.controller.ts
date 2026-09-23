import { Controller, Get, Query } from '@nestjs/common';
import { ProjectionQueryDto } from '../dtos/scheduled-item-request.dto';
import { ProjectionResponseDto } from '../dtos/scheduled-item-response.dto';
import { ScheduledItemsService } from '../services/scheduled-items.service';

@Controller('projection')
export class ProjectionController {
  constructor(private readonly scheduledItems: ScheduledItemsService) {}

  @Get()
  async get(@Query() query: ProjectionQueryDto): Promise<ProjectionResponseDto> {
    return ProjectionResponseDto.from(await this.scheduledItems.projection(query.horizon));
  }
}
