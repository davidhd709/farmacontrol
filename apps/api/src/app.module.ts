import { Module, NestModule, MiddlewareConsumer } from '@nestjs/common';
import { APP_INTERCEPTOR, APP_FILTER } from '@nestjs/core';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { IdentityModule } from './modules/identity/identity.module';
import { AuditModule } from './modules/audit/audit.module';
import { CatalogModule } from './modules/catalog/catalog.module';
import { InventoryModule } from './modules/inventory/inventory.module';
import { SuppliersModule } from './modules/suppliers/suppliers.module';
import { PurchasesModule } from './modules/purchases/purchases.module';
import { CashModule } from './modules/cash/cash.module';
import { CustomersModule } from './modules/customers/customers.module';
import { SalesModule } from './modules/sales/sales.module';
import { ReceivablesModule } from './modules/receivables/receivables.module';
import { PayablesModule } from './modules/payables/payables.module';
import { AlertsModule } from './modules/alerts/alerts.module';
import { ReportsModule } from './modules/reports/reports.module';
import { BackupsModule } from './modules/backups/backups.module';
import { AccountingModule } from './modules/accounting/accounting.module';
import { TreasuryModule } from './modules/treasury/treasury.module';
import { ExpensesModule } from './modules/expenses/expenses.module';
import { CorrelationIdMiddleware } from './common/middleware/correlation-id.middleware';
import { CorrelationIdInterceptor } from './common/interceptors/correlation-id.interceptor';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';

@Module({
  imports: [IdentityModule, AuditModule, CatalogModule, InventoryModule, SuppliersModule, PurchasesModule, CashModule, CustomersModule, SalesModule, ReceivablesModule, PayablesModule, AlertsModule, ReportsModule, BackupsModule, AccountingModule, TreasuryModule, ExpensesModule],
  controllers: [AppController],
  providers: [
    AppService,
    {
      provide: APP_INTERCEPTOR,
      useClass: CorrelationIdInterceptor,
    },
    {
      provide: APP_FILTER,
      useClass: HttpExceptionFilter,
    },
  ],
})
export class AppModule implements NestModule {
  public configure(consumer: MiddlewareConsumer): void {
    consumer.apply(CorrelationIdMiddleware).forRoutes('*');
  }
}
