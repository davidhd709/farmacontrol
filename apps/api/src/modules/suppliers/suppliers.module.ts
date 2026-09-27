import { Module } from '@nestjs/common';
import { IdentityModule } from '../identity/identity.module';
import { AuditModule } from '../audit/audit.module';
import { SUPPLIER_REPOSITORY } from './domain/supplier.repository';
import { PrismaSupplierRepository } from './infrastructure/prisma-supplier.repository';
import { SupplierService } from './application/supplier.service';
import { SupplierController } from './presentation/controllers/supplier.controller';

@Module({
  imports: [IdentityModule, AuditModule],
  controllers: [SupplierController],
  providers: [
    {
      provide: SUPPLIER_REPOSITORY,
      useClass: PrismaSupplierRepository,
    },
    SupplierService,
  ],
  exports: [SUPPLIER_REPOSITORY, SupplierService],
})
export class SuppliersModule {}
