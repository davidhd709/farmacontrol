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

@Module({
  imports: [IdentityModule, AuditModule, CustomersModule, AccountingModule],
  controllers: [SaleController],
  providers: [
    SaleService,
    IdempotencyService,
    {
      provide: SALE_REPOSITORY,
      useClass: PrismaSaleRepository,
    },
  ],
  exports: [SaleService, SALE_REPOSITORY],
})
export class SalesModule {}
