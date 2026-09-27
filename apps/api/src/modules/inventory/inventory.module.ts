import { Module } from '@nestjs/common';
import { IdentityModule } from '../identity/identity.module';
import { AuditModule } from '../audit/audit.module';
import { CatalogModule } from '../catalog/catalog.module';
import { INVENTORY_LOT_REPOSITORY_PORT } from './application/ports/inventory-lot.repository.port';
import { PrismaInventoryLotRepository } from './infrastructure/adapters/prisma-inventory-lot.repository';
import { InventoryLotService } from './application/services/inventory-lot.service';
import { InventoryLotController } from './presentation/controllers/inventory-lot.controller';
import { INVENTORY_MOVEMENT_REPOSITORY_PORT } from './application/ports/inventory-movement.repository.port';
import { PrismaInventoryMovementRepository } from './infrastructure/adapters/prisma-inventory-movement.repository';
import { InventoryMovementService } from './application/services/inventory-movement.service';
import { InventoryMovementController } from './presentation/controllers/inventory-movement.controller';

@Module({
  imports: [IdentityModule, AuditModule, CatalogModule],
  controllers: [InventoryLotController, InventoryMovementController],
  providers: [
    {
      provide: INVENTORY_LOT_REPOSITORY_PORT,
      useClass: PrismaInventoryLotRepository,
    },
    {
      provide: INVENTORY_MOVEMENT_REPOSITORY_PORT,
      useClass: PrismaInventoryMovementRepository,
    },
    InventoryLotService,
    InventoryMovementService,
  ],
  exports: [
    INVENTORY_LOT_REPOSITORY_PORT,
    INVENTORY_MOVEMENT_REPOSITORY_PORT,
    InventoryLotService,
    InventoryMovementService,
  ],
})
export class InventoryModule {}
