import { Module } from '@nestjs/common';
import { PayablesService } from './application/payables.service';
import { PayablesLedger } from './application/payables-ledger';
import { PayablesController } from './presentation/payables.controller';
import { CashModule } from '../cash/cash.module';
import { IdentityModule } from '../identity/identity.module';
import { AccountingModule } from '../accounting/accounting.module';
import { IdempotencyModule } from '../../common/idempotency/idempotency.module';

@Module({
  imports: [IdempotencyModule, CashModule, IdentityModule, AccountingModule],
  controllers: [PayablesController],
  providers: [PayablesService, PayablesLedger],
  exports: [PayablesService, PayablesLedger],
})
export class PayablesModule {}
