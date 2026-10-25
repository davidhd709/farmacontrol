import { Module } from '@nestjs/common';
import { IdentityModule } from '../identity/identity.module';
import { TaxCatalogController } from './presentation/tax-catalog.controller';

/** Catálogo normativo y motor tributario colombiano (ADR-006, F6). */
@Module({
  imports: [IdentityModule],
  controllers: [TaxCatalogController],
})
export class TaxesModule {}
