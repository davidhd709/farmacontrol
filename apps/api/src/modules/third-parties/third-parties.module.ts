import { Module } from '@nestjs/common';
import { ThirdPartyController } from './presentation/controllers/third-party.controller';
import { ThirdPartyService, THIRD_PARTY_REPOSITORY } from './application/third-party.service';
import { PrismaThirdPartyRepository } from './infrastructure/prisma-third-party.repository';
import { AuditModule } from '../audit/audit.module';
import { IdentityModule } from '../identity/identity.module';

@Module({
  imports: [AuditModule, IdentityModule],
  controllers: [ThirdPartyController],
  providers: [
    ThirdPartyService,
    {
      provide: THIRD_PARTY_REPOSITORY,
      useClass: PrismaThirdPartyRepository,
    },
    PrismaThirdPartyRepository,
  ],
  exports: [ThirdPartyService, THIRD_PARTY_REPOSITORY],
})
export class ThirdPartiesModule {}
