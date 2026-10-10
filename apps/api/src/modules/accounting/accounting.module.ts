import { Module } from '@nestjs/common';
import { IdentityModule } from '../identity/identity.module';
import { AccountingService } from './application/accounting.service';
import { JournalService } from './application/journal.service';
import { ProductTaxProfileService } from './application/product-tax-profile.service';
import { AccountingEngineService } from './application/accounting-engine.service';
import { AccountingReportsService } from './application/reports.service';
import { AccountingRepository } from './infrastructure/accounting.repository';
import {
  AccountsController,
  AccountingConfigurationController,
} from './presentation/accounting.controller';
import { ProductTaxProfileController } from './presentation/product-tax-profile.controller';
import { JournalController } from './presentation/journal.controller';
import { AccountingReportsController } from './presentation/reports.controller';
import { FiscalPeriodsService } from './application/fiscal-periods.service';
import { FiscalPeriodsController } from './presentation/fiscal-periods.controller';
import { DocumentLockService } from './application/document-lock.service';
import { DocumentLockController } from './presentation/document-lock.controller';

@Module({
  imports: [IdentityModule],
  controllers: [
    AccountsController,
    AccountingConfigurationController,
    ProductTaxProfileController,
    JournalController,
    AccountingReportsController,
    FiscalPeriodsController,
    DocumentLockController,
  ],
  providers: [
    AccountingService,
    AccountingRepository,
    JournalService,
    ProductTaxProfileService,
    AccountingEngineService,
    AccountingReportsService,
    FiscalPeriodsService,
    DocumentLockService,
  ],
  exports: [
    AccountingService,
    JournalService,
    ProductTaxProfileService,
    AccountingEngineService,
    AccountingReportsService,
    FiscalPeriodsService,
  ],
})
export class AccountingModule {}

