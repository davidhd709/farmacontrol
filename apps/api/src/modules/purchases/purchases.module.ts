import { Module } from '@nestjs/common';
import { IdentityModule } from '../identity/identity.module';
import { AuditModule } from '../audit/audit.module';
import { CatalogModule } from '../catalog/catalog.module';
import { InventoryModule } from '../inventory/inventory.module';
import { SuppliersModule } from '../suppliers/suppliers.module';
import { AccountingModule } from '../accounting/accounting.module';
import { PURCHASE_REPOSITORY } from './domain/purchase.repository';
import { PrismaPurchaseRepository } from './infrastructure/prisma-purchase.repository';
import { PurchaseService } from './application/purchase.service';
import { PurchaseController } from './presentation/controllers/purchase.controller';

import { DebitNotesController } from './presentation/controllers/debit-notes.controller';
import { DebitNotesService } from './application/debit-notes.service';

@Module({
  imports: [IdentityModule, AuditModule, CatalogModule, InventoryModule, SuppliersModule, AccountingModule],
  controllers: [PurchaseController, DebitNotesController],
  providers: [
    {
      provide: PURCHASE_REPOSITORY,
      useClass: PrismaPurchaseRepository,
    },
    PurchaseService,
    DebitNotesService,
  ],
  exports: [PURCHASE_REPOSITORY, PurchaseService, DebitNotesService],
})
export class PurchasesModule {}
