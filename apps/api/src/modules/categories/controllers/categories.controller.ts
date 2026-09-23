import { Body, Controller, Get, HttpCode, Param, Patch, Post, Query } from '@nestjs/common';
import {
  CategoryCreateRequestDto,
  CategoryUpdateRequestDto,
  IdParamDto,
  IncludeArchivedQueryDto,
} from '../dtos/category-request.dto';
import { CategoryResponseDto } from '../dtos/category-response.dto';
import { CategoriesService } from '../services/categories.service';

@Controller('categories')
export class CategoriesController {
  constructor(private readonly categories: CategoriesService) {}

  @Get()
  async list(@Query() query: IncludeArchivedQueryDto): Promise<CategoryResponseDto[]> {
    return (await this.categories.list(query.includeArchived)).map((row) =>
      CategoryResponseDto.from(row),
    );
  }

  @Post()
  async create(@Body() body: CategoryCreateRequestDto): Promise<CategoryResponseDto> {
    return CategoryResponseDto.from(await this.categories.create(body));
  }

  @Patch(':id')
  async update(
    @Param() params: IdParamDto,
    @Body() body: CategoryUpdateRequestDto,
  ): Promise<CategoryResponseDto> {
    return CategoryResponseDto.from(await this.categories.update(BigInt(params.id), body));
  }

  @Post(':id/archive')
  @HttpCode(200)
  async archive(@Param() params: IdParamDto): Promise<CategoryResponseDto> {
    return CategoryResponseDto.from(await this.categories.setArchived(BigInt(params.id), true));
  }

  @Post(':id/unarchive')
  @HttpCode(200)
  async unarchive(@Param() params: IdParamDto): Promise<CategoryResponseDto> {
    return CategoryResponseDto.from(await this.categories.setArchived(BigInt(params.id), false));
  }
}
