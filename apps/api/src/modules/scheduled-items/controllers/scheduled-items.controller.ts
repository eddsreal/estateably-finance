import { Body, Controller, Delete, Get, HttpCode, Param, Post, Put } from '@nestjs/common';
import {
  ConfirmScheduledItemRequestDto,
  IdParamDto,
  ScheduledItemRequestDto,
} from '../dtos/scheduled-item-request.dto';
import {
  ConfirmScheduledItemResponseDto,
  ScheduledItemResponseDto,
} from '../dtos/scheduled-item-response.dto';
import { ScheduledItemInput, ScheduledItemsService } from '../services/scheduled-items.service';

function toInput(dto: ScheduledItemRequestDto): ScheduledItemInput {
  return {
    kind: dto.kind,
    description: dto.description,
    amount: BigInt(dto.amount),
    accountId: BigInt(dto.accountId),
    categoryId: BigInt(dto.categoryId),
    nextDueDate: dto.nextDueDate,
    recurrence: dto.recurrence,
    endDate: dto.endDate,
  };
}

@Controller('scheduled-items')
export class ScheduledItemsController {
  constructor(private readonly scheduledItems: ScheduledItemsService) {}

  @Get()
  async list(): Promise<ScheduledItemResponseDto[]> {
    return (await this.scheduledItems.list()).map((view) => ScheduledItemResponseDto.from(view));
  }

  @Post()
  async create(@Body() body: ScheduledItemRequestDto): Promise<ScheduledItemResponseDto> {
    return ScheduledItemResponseDto.from(await this.scheduledItems.create(toInput(body)));
  }

  @Put(':id')
  async update(
    @Param() params: IdParamDto,
    @Body() body: ScheduledItemRequestDto,
  ): Promise<ScheduledItemResponseDto> {
    return ScheduledItemResponseDto.from(
      await this.scheduledItems.update(BigInt(params.id), toInput(body)),
    );
  }

  @Delete(':id')
  @HttpCode(204)
  async remove(@Param() params: IdParamDto): Promise<void> {
    await this.scheduledItems.remove(BigInt(params.id));
  }

  @Post(':id/confirm')
  async confirm(
    @Param() params: IdParamDto,
    @Body() body: ConfirmScheduledItemRequestDto,
  ): Promise<ConfirmScheduledItemResponseDto> {
    return ConfirmScheduledItemResponseDto.from(
      await this.scheduledItems.confirm(BigInt(params.id), {
        amount: BigInt(body.amount),
        date: body.date,
        accountId: BigInt(body.accountId),
        categoryId: BigInt(body.categoryId),
        description: body.description,
      }),
    );
  }
}
