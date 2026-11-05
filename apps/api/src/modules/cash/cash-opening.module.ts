import { Module } from '@nestjs/common';
import { CashOpeningService } from './application/cash-opening.service';
import { PrismaCashMovementRepository } from './infrastructure/prisma-cash-movement.repository';

/** Contrato ligero: no depende del motor contable ni de CashModule (evita un ciclo). */
@Module({
  providers: [CashOpeningService, PrismaCashMovementRepository],
  exports: [CashOpeningService],
})
export class CashOpeningModule {}
