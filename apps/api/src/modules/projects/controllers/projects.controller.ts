import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Query } from '@nestjs/common';
import {
  IdParamDto,
  PageQueryDto,
  ProjectCreateRequestDto,
  ProjectUpdateRequestDto,
} from '../dtos/project-request.dto';
import { ProjectResponseDto, ProjectTransactionPageDto } from '../dtos/project-response.dto';
import { ProjectsService } from '../services/projects.service';

@Controller('projects')
export class ProjectsController {
  constructor(private readonly projects: ProjectsService) {}

  @Get()
  async list(): Promise<ProjectResponseDto[]> {
    return (await this.projects.list()).map((report) => ProjectResponseDto.from(report));
  }

  @Post()
  async create(@Body() body: ProjectCreateRequestDto): Promise<ProjectResponseDto> {
    return ProjectResponseDto.from(
      await this.projects.create({
        name: body.name,
        budget: body.budget === undefined ? undefined : BigInt(body.budget),
      }),
    );
  }

  @Patch(':id')
  async update(
    @Param() params: IdParamDto,
    @Body() body: ProjectUpdateRequestDto,
  ): Promise<ProjectResponseDto> {
    return ProjectResponseDto.from(
      await this.projects.update(BigInt(params.id), {
        name: body.name,
        budget:
          body.budget === undefined ? undefined : body.budget === null ? null : BigInt(body.budget),
      }),
    );
  }

  @Delete(':id')
  @HttpCode(204)
  async remove(@Param() params: IdParamDto): Promise<void> {
    await this.projects.remove(BigInt(params.id));
  }

  @Post(':id/close')
  @HttpCode(200)
  async close(@Param() params: IdParamDto): Promise<ProjectResponseDto> {
    return ProjectResponseDto.from(await this.projects.setStatus(BigInt(params.id), 'closed'));
  }

  @Post(':id/reopen')
  @HttpCode(200)
  async reopen(@Param() params: IdParamDto): Promise<ProjectResponseDto> {
    return ProjectResponseDto.from(await this.projects.setStatus(BigInt(params.id), 'active'));
  }

  @Get(':id/transactions')
  async transactions(
    @Param() params: IdParamDto,
    @Query() query: PageQueryDto,
  ): Promise<ProjectTransactionPageDto> {
    return ProjectTransactionPageDto.from(
      await this.projects.listTransactions(BigInt(params.id), {
        limit: query.limit,
        offset: query.offset,
      }),
    );
  }
}
