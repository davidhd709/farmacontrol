import { Module } from '@nestjs/common';
import { SaleController } from './presentation/controllers/sale.controller';
import { SaleService } from './application/sale.service';
import { SALE_REPOSITORY } from './domain/sale.repository';
import { PrismaSaleRepository } from './infrastructure/prisma-sale.repository';
import { IdempotencyModule } from '../../common/idempotency/idempotency.module';
import { AuditModule } from '../audit/audit.module';
import { IdentityModule } from '../identity/identity.module';
import { CustomersModule } from '../customers/customers.module';
import { AccountingModule } from '../accounting/accounting.module';
import { CashModule } from '../cash/cash.module';
import { ReceivablesModule } from '../receivables/receivables.module';
import { InventoryModule } from '../inventory/inventory.module';

import { CreditNotesController } from './presentation/controllers/credit-notes.controller';
import { CreditNotesService } from './application/credit-notes.service';

@Module({
  imports: [
    IdempotencyModule,
    IdentityModule,
    AuditModule,
    CustomersModule,
    AccountingModule,
    CashModule,
    ReceivablesModule,
    InventoryModule,
  ],
  controllers: [SaleController, CreditNotesController],
  providers: [
    SaleService,
    CreditNotesService,
    {
      provide: SALE_REPOSITORY,
      useClass: PrismaSaleRepository,
    },
  ],
  exports: [SaleService, CreditNotesService, SALE_REPOSITORY],
})
export class SalesModule {}
