import { Module } from '@nestjs/common';
import { IdentityModule } from '../identity/identity.module';
import { AuditModule } from '../audit/audit.module';
import { CASH_MOVEMENT_REPOSITORY } from './domain/cash-movement.repository';
import { PrismaCashMovementRepository } from './infrastructure/prisma-cash-movement.repository';
import { CashService } from './application/cash.service';
import { CashController } from './presentation/controllers/cash.controller';

@Module({
  imports: [IdentityModule, AuditModule],
  controllers: [CashController],
  providers: [
    {
      provide: CASH_MOVEMENT_REPOSITORY,
      useClass: PrismaCashMovementRepository,
    },
    CashService,
  ],
  exports: [CASH_MOVEMENT_REPOSITORY, CashService],
})
export class CashModule {}
