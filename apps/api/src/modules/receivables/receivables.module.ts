import { Module } from '@nestjs/common';
import { ReceivablesService } from './application/receivables.service';
import { ReceivablesController } from './presentation/receivables.controller';
import { CashModule } from '../cash/cash.module';
import { IdentityModule } from '../identity/identity.module';

@Module({
  imports: [CashModule, IdentityModule],
  controllers: [ReceivablesController],
  providers: [ReceivablesService],
  exports: [ReceivablesService],
})
export class ReceivablesModule {}
