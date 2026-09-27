import { Module } from '@nestjs/common';
import { AUDIT_EVENT_REPOSITORY_PORT } from './application/ports/audit-event.repository.port';
import { PrismaAuditEventRepository } from './infrastructure/adapters/prisma-audit-event.repository';
import { AuditService } from './application/services/audit.service';

@Module({
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
