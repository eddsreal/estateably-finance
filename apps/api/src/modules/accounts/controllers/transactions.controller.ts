import { Body, Controller, Delete, Get, HttpCode, Param, Post, Put, Query } from '@nestjs/common';
import { IdParamDto } from '../dtos/account-request.dto';
import { TransactionListQueryDto } from '../dtos/transaction-list-query.dto';
import { TransactionRequestDto, TransactionRequestPipe } from '../dtos/transaction-request.dto';
import { PaginatedTransactionsDto, TransactionResponseDto } from '../dtos/transaction-response.dto';
import { TransactionsService, UserTransactionInput } from '../services/transactions.service';

function toInput(dto: TransactionRequestDto): UserTransactionInput {
  const base = {
    date: dto.date,
    description: dto.description,
    amount: BigInt(dto.amount),
    accountId: BigInt(dto.accountId),
  };
  switch (dto.kind) {
    case 'expense':
      return {
        ...base,
        kind: 'expense',
        categoryId: BigInt(dto.categoryId),
        projectId: dto.projectId === undefined ? undefined : BigInt(dto.projectId),
      };
    case 'income':
      return { ...base, kind: 'income', categoryId: BigInt(dto.categoryId) };
    case 'transfer':
      return { ...base, kind: 'transfer', counterAccountId: BigInt(dto.counterAccountId) };
  }
}

@Controller('transactions')
export class TransactionsController {
  constructor(private readonly transactions: TransactionsService) {}

  @Get()
  async list(@Query() query: TransactionListQueryDto): Promise<PaginatedTransactionsDto> {
    return PaginatedTransactionsDto.from(
      await this.transactions.list({
        accountId: query.accountId === undefined ? undefined : BigInt(query.accountId),
        kind: query.kind,
        categoryId: query.categoryId === undefined ? undefined : BigInt(query.categoryId),
        projectId: query.projectId === undefined ? undefined : BigInt(query.projectId),
        from: query.from,
        to: query.to,
        q: query.q,
        limit: query.limit,
        offset: query.offset,
      }),
    );
  }

  @Post()
  async create(
    @Body(TransactionRequestPipe) body: TransactionRequestDto,
  ): Promise<TransactionResponseDto> {
    return TransactionResponseDto.from(await this.transactions.record(toInput(body)));
  }

  @Put(':id')
  async update(
    @Param() params: IdParamDto,
    @Body(TransactionRequestPipe) body: TransactionRequestDto,
  ): Promise<TransactionResponseDto> {
    return TransactionResponseDto.from(
      await this.transactions.update(BigInt(params.id), toInput(body)),
    );
  }

  @Delete(':id')
  @HttpCode(204)
  async remove(@Param() params: IdParamDto): Promise<void> {
    await this.transactions.remove(BigInt(params.id));
  }
}
