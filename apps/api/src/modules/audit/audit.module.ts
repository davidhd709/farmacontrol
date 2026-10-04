import { Module, forwardRef } from '@nestjs/common';
import { AUDIT_EVENT_REPOSITORY_PORT } from './application/ports/audit-event.repository.port';
import { PrismaAuditEventRepository } from './infrastructure/adapters/prisma-audit-event.repository';
import { AuditService } from './application/services/audit.service';
import { AuditController } from './presentation/controllers/audit.controller';
import { IdentityModule } from '../identity/identity.module';

@Module({
  imports: [forwardRef(() => IdentityModule)],
  controllers: [AuditController],
  providers: [
    {
      provide: AUDIT_EVENT_REPOSITORY_PORT,
      useClass: PrismaAuditEventRepository,
    },
    AuditService,
  ],
  exports: [AUDIT_EVENT_REPOSITORY_PORT, AuditService],
})
export class AuditModule {}
