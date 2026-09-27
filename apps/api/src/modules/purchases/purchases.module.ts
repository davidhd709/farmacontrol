import { Module } from '@nestjs/common';
import { IdentityModule } from '../identity/identity.module';
import { AuditModule } from '../audit/audit.module';
import { CatalogModule } from '../catalog/catalog.module';
import { InventoryModule } from '../inventory/inventory.module';
import { SuppliersModule } from '../suppliers/suppliers.module';
import { PURCHASE_REPOSITORY } from './domain/purchase.repository';
import { PrismaPurchaseRepository } from './infrastructure/prisma-purchase.repository';
import { PurchaseService } from './application/purchase.service';
import { PurchaseController } from './presentation/controllers/purchase.controller';

@Module({
  imports: [IdentityModule, AuditModule, CatalogModule, InventoryModule, SuppliersModule],
  controllers: [PurchaseController],
  providers: [
    {
      provide: PURCHASE_REPOSITORY,
      useClass: PrismaPurchaseRepository,
    },
    PurchaseService,
  ],
  exports: [PURCHASE_REPOSITORY, PurchaseService],
})
export class PurchasesModule {}
