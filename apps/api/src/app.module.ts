import { Module } from '@nestjs/common';
import { LedgerModule } from './modules/ledger/ledger.module';

@Module({ imports: [LedgerModule] })
export class AppModule {}
