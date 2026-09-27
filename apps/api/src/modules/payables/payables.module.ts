import { Module } from '@nestjs/common';
import { PayablesService } from './application/payables.service';
import { PayablesController } from './presentation/payables.controller';
import { CashModule } from '../cash/cash.module';
import { IdentityModule } from '../identity/identity.module';

@Module({
  imports: [CashModule, IdentityModule],
  controllers: [PayablesController],
  providers: [PayablesService],
  exports: [PayablesService],
})
export class PayablesModule {}
