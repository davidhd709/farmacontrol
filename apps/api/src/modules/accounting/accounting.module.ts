import { Module } from '@nestjs/common';
import { IdentityModule } from '../identity/identity.module';
import { AccountingService } from './application/accounting.service';
import { JournalService } from './application/journal.service';
import { ProductTaxProfileService } from './application/product-tax-profile.service';
import { AccountingRepository } from './infrastructure/accounting.repository';
import {
  AccountsController,
  AccountingConfigurationController,
} from './presentation/accounting.controller';
import { ProductTaxProfileController } from './presentation/product-tax-profile.controller';

@Module({
  imports: [IdentityModule],
  controllers: [AccountsController, AccountingConfigurationController, ProductTaxProfileController],
  providers: [AccountingService, AccountingRepository, JournalService, ProductTaxProfileService],
  exports: [AccountingService, JournalService, ProductTaxProfileService],
})
export class AccountingModule {}
