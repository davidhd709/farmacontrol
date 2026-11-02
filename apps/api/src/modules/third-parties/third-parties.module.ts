import { Module } from '@nestjs/common';
import { ThirdPartyController } from './presentation/controllers/third-party.controller';
import { ThirdPartyService, THIRD_PARTY_REPOSITORY } from './application/third-party.service';
import { PrismaThirdPartyRepository } from './infrastructure/prisma-third-party.repository';
import { AuditModule } from '../audit/audit.module';
import { IdentityModule } from '../identity/identity.module';
import { PayablesModule } from '../payables/payables.module';
import { ThirdPartyStatementService } from './application/third-party-statement.service';
import { ThirdPartyStatementController } from './presentation/controllers/third-party-statement.controller';

@Module({
  imports: [AuditModule, IdentityModule, PayablesModule],
  controllers: [ThirdPartyController, ThirdPartyStatementController],
  providers: [
    ThirdPartyService,
    {
      provide: THIRD_PARTY_REPOSITORY,
      useClass: PrismaThirdPartyRepository,
    },
    PrismaThirdPartyRepository,
    ThirdPartyStatementService,
  ],
  exports: [ThirdPartyService, THIRD_PARTY_REPOSITORY],
})
export class ThirdPartiesModule {}
