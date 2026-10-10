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
import { ManualNotesService } from './application/manual-notes.service';
import { ManualNotesController } from './presentation/manual-notes.controller';
import { AnnualClosingService } from './application/annual-closing.service';
import { AnnualClosingController } from './presentation/annual-closing.controller';
import { IdempotencyService } from '../sales/infrastructure/idempotency.service';

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
    ManualNotesController,
    AnnualClosingController,
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
    ManualNotesService,
    AnnualClosingService,
    IdempotencyService,
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

