import { Module } from '@nestjs/common';
import { IdentityModule } from '../identity/identity.module';
import { TaxCatalogController } from './presentation/tax-catalog.controller';
import { TaxReportsController } from './presentation/tax-reports.controller';
import { TaxReportsService } from './application/tax-reports.service';

/** Catálogo normativo y motor tributario colombiano (ADR-006, F6). */
@Module({
  imports: [IdentityModule],
  controllers: [TaxCatalogController, TaxReportsController],
  providers: [TaxReportsService],
})
export class TaxesModule {}
