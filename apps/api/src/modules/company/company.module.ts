import { Module } from '@nestjs/common';
import { IdentityModule } from '../identity/identity.module';
import { AuditModule } from '../audit/audit.module';
import { CompanyController } from './presentation/company.controller';
import { CompanyService } from './application/company.service';

/** Empresa, sucursales y políticas contables (ADR-006, F3). */
@Module({
  imports: [IdentityModule, AuditModule],
  controllers: [CompanyController],
  providers: [CompanyService],
  exports: [CompanyService],
})
export class CompanyModule {}
