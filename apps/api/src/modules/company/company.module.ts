import { Module } from '@nestjs/common';
import { IdentityModule } from '../identity/identity.module';
import { AuditModule } from '../audit/audit.module';
import { CompanyController } from './presentation/company.controller';
import { CompanyService } from './application/company.service';
import { CompanyTaxProfileService } from './application/company-tax-profile.service';

/** Empresa, sucursales, políticas contables (F3) y perfil tributario (F6), ADR-006. */
@Module({
  imports: [IdentityModule, AuditModule],
  controllers: [CompanyController],
  providers: [CompanyService, CompanyTaxProfileService],
  exports: [CompanyService],
})
export class CompanyModule {}
