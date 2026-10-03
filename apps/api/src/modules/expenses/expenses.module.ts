import { Module } from '@nestjs/common';
import { ExpenseCategoriesService } from './application/expense-categories.service';
import { ExpensesService } from './application/expenses.service';
import { ExpenseCategoriesController } from './presentation/expense-categories.controller';
import { ExpensesController } from './presentation/expenses.controller';
import { CashModule } from '../cash/cash.module';
import { TreasuryModule } from '../treasury/treasury.module';
import { AccountingModule } from '../accounting/accounting.module';
import { IdentityModule } from '../identity/identity.module';

@Module({
  imports: [CashModule, TreasuryModule, AccountingModule, IdentityModule],
  controllers: [ExpenseCategoriesController, ExpensesController],
  providers: [ExpenseCategoriesService, ExpensesService],
  exports: [ExpenseCategoriesService, ExpensesService],
})
export class ExpensesModule {}
