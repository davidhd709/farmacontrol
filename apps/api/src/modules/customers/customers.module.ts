import { Module } from '@nestjs/common';
import { CustomerController } from './presentation/controllers/customer.controller';
import { CustomerService } from './application/customer.service';
import { CUSTOMER_REPOSITORY } from './domain/customer.repository';
import { PrismaCustomerRepository } from './infrastructure/prisma-customer.repository';
import { AuditModule } from '../audit/audit.module';
import { IdentityModule } from '../identity/identity.module';
import { ThirdPartiesModule } from '../third-parties/third-parties.module';
import { CustomersLedger } from './application/customers-ledger';

@Module({
  imports: [AuditModule, IdentityModule, ThirdPartiesModule],
  controllers: [CustomerController],
  providers: [
    CustomersLedger,
    CustomerService,
    {
      provide: CUSTOMER_REPOSITORY,
      useClass: PrismaCustomerRepository,
    },
  ],
  exports: [CustomerService, CUSTOMER_REPOSITORY, CustomersLedger],
})
export class CustomersModule {}
