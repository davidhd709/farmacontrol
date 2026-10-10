import { Module } from '@nestjs/common';
import { IdentityModule } from '../identity/identity.module';
import { TreasuryService } from './application/treasury.service';
import { TreasuryController } from './presentation/treasury.controller';
import { TreasuryDocumentsService } from './application/treasury-documents.service';
import { TreasuryDocumentsController } from './presentation/treasury-documents.controller';

@Module({
  imports: [IdentityModule],
  controllers: [TreasuryController, TreasuryDocumentsController],
  providers: [TreasuryService, TreasuryDocumentsService],
  exports: [TreasuryService],
})
export class TreasuryModule {}
