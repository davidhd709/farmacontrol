import { Module } from '@nestjs/common';
import { SaleController } from './presentation/controllers/sale.controller';
import { SaleService } from './application/sale.service';
import { SALE_REPOSITORY } from './domain/sale.repository';
import { PrismaSaleRepository } from './infrastructure/prisma-sale.repository';
import { IdempotencyService } from './infrastructure/idempotency.service';
import { AuditModule } from '../audit/audit.module';
import { IdentityModule } from '../identity/identity.module';
import { CustomersModule } from '../customers/customers.module';
import { AccountingModule } from '../accounting/accounting.module';

import { CreditNotesController } from './presentation/controllers/credit-notes.controller';
import { CreditNotesService } from './application/credit-notes.service';

@Module({
  imports: [IdentityModule, AuditModule, CustomersModule, AccountingModule],
  controllers: [SaleController, CreditNotesController],
  providers: [
    SaleService,
    CreditNotesService,
    IdempotencyService,
    {
      provide: SALE_REPOSITORY,
      useClass: PrismaSaleRepository,
    },
  ],
  exports: [SaleService, CreditNotesService, SALE_REPOSITORY],
})
export class SalesModule {}
