import { Body, Controller, Get, HttpCode, Param, Patch, Post, Query } from '@nestjs/common';
import {
  AccountCreateRequestDto,
  AccountUpdateRequestDto,
  BalanceAsOfQueryDto,
  IdParamDto,
  IncludeArchivedQueryDto,
} from '../dtos/account-request.dto';
import {
  AccountListResponseDto,
  AccountResponseDto,
  BalanceResponseDto,
} from '../dtos/account-response.dto';
import { BalanceHistoryQueryDto, BalanceHistoryQueryPipe } from '../dtos/balance-history-query.dto';
import { BalanceHistoryResponseDto } from '../dtos/balance-history-response.dto';
import { AccountsService } from '../services/accounts.service';

@Controller('accounts')
export class AccountsController {
  constructor(private readonly accounts: AccountsService) {}

  @Get()
  async list(@Query() query: IncludeArchivedQueryDto): Promise<AccountListResponseDto> {
    return AccountListResponseDto.from(await this.accounts.list(query.includeArchived));
  }

  @Post()
  async create(@Body() body: AccountCreateRequestDto): Promise<AccountResponseDto> {
    return AccountResponseDto.from(
      await this.accounts.create({
        name: body.name,
        kind: body.kind,
        openingBalance: BigInt(body.openingBalance),
        openingDate: body.openingDate,
      }),
    );
  }

  @Get('balance-history')
  async getBalanceHistory(
    @Query(BalanceHistoryQueryPipe) query: BalanceHistoryQueryDto,
  ): Promise<BalanceHistoryResponseDto> {
    return BalanceHistoryResponseDto.from(
      await this.accounts.balanceHistory({
        from: query.from,
        to: query.to,
        includeArchived: query.includeArchived,
      }),
    );
  }

  @Get(':id/balance')
  async balanceAsOf(
    @Param() params: IdParamDto,
    @Query() query: BalanceAsOfQueryDto,
  ): Promise<BalanceResponseDto> {
    const accountId = BigInt(params.id);
    return BalanceResponseDto.from({
      accountId,
      asOf: query.asOf,
      balance: await this.accounts.balanceAsOf(accountId, query.asOf),
    });
  }

  @Patch(':id')
  async update(
    @Param() params: IdParamDto,
    @Body() body: AccountUpdateRequestDto,
  ): Promise<AccountResponseDto> {
    return AccountResponseDto.from(
      await this.accounts.update(BigInt(params.id), {
        name: body.name,
        kind: body.kind,
        openingBalance: body.openingBalance === undefined ? undefined : BigInt(body.openingBalance),
        openingDate: body.openingDate,
      }),
    );
  }

  @Post(':id/archive')
  @HttpCode(200)
  async archive(@Param() params: IdParamDto): Promise<AccountResponseDto> {
    return AccountResponseDto.from(await this.accounts.setArchived(BigInt(params.id), true));
  }

  @Post(':id/unarchive')
  @HttpCode(200)
  async unarchive(@Param() params: IdParamDto): Promise<AccountResponseDto> {
    return AccountResponseDto.from(await this.accounts.setArchived(BigInt(params.id), false));
  }
}
