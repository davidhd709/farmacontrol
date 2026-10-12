import { Module } from '@nestjs/common';
import { ReceivablesService } from './application/receivables.service';
import { ReceivablesLedger } from './application/receivables-ledger';
import { ReceivablesController } from './presentation/receivables.controller';
import { CashModule } from '../cash/cash.module';
import { IdentityModule } from '../identity/identity.module';
import { AccountingModule } from '../accounting/accounting.module';
import { IdempotencyModule } from '../../common/idempotency/idempotency.module';

@Module({
  imports: [IdempotencyModule, CashModule, IdentityModule, AccountingModule],
  controllers: [ReceivablesController],
  providers: [ReceivablesService, ReceivablesLedger],
  exports: [ReceivablesService, ReceivablesLedger],
})
export class ReceivablesModule {}
