import { Module } from '@nestjs/common';
import { IdentityModule } from '../identity/identity.module';
import { AccountingModule } from '../accounting/accounting.module';
import { CashModule } from '../cash/cash.module';
import { ReceivablesModule } from '../receivables/receivables.module';
import { PayablesModule } from '../payables/payables.module';
import { ExpensesModule } from '../expenses/expenses.module';
import { TreasuryDocumentsService } from './application/treasury-documents.service';
import { TreasuryVouchersService } from './application/treasury-vouchers.service';
import { TreasuryVouchersController } from './presentation/treasury-vouchers.controller';

/**
 * Recibos de caja y comprobantes de egreso como documento de origen. Módulo aparte del de
 * tesorería porque coordina cartera, cuentas por pagar y gastos, y gastos ya depende de
 * tesorería.
 */
@Module({
  imports: [IdentityModule, AccountingModule, CashModule, ReceivablesModule, PayablesModule, ExpensesModule],
  controllers: [TreasuryVouchersController],
  providers: [TreasuryVouchersService, TreasuryDocumentsService],
})
export class TreasuryVouchersModule {}
