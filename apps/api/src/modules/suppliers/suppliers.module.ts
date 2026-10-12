import { Module } from '@nestjs/common';
import { IdentityModule } from '../identity/identity.module';
import { ThirdPartiesModule } from '../third-parties/third-parties.module';
import { AuditModule } from '../audit/audit.module';
import { SUPPLIER_REPOSITORY } from './domain/supplier.repository';
import { PrismaSupplierRepository } from './infrastructure/prisma-supplier.repository';
import { SupplierService } from './application/supplier.service';
import { SupplierController } from './presentation/controllers/supplier.controller';
import { SuppliersLedger } from './application/suppliers-ledger';

@Module({
  imports: [IdentityModule, AuditModule, ThirdPartiesModule],
  controllers: [SupplierController],
  providers: [
    SuppliersLedger,
    {
      provide: SUPPLIER_REPOSITORY,
      useClass: PrismaSupplierRepository,
    },
    SupplierService,
  ],
  exports: [SUPPLIER_REPOSITORY, SupplierService, SuppliersLedger],
})
export class SuppliersModule {}
