import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import {
  SYSTEM_PERMISSIONS,
  type AccountingAuditDto,
  type AccountingAuditView,
} from '@farmacia/contracts';
import { QueryShapeValidationPipe } from '../../../common/pagination/request-shape.pipe';
import { AccountingAuditService } from '../application/accounting-audit.service';
import { SessionAuthGuard } from '../../identity/presentation/guards/session-auth.guard';
import { PermissionsGuard } from '../../identity/presentation/guards/permissions.guard';
import { RequirePermissions } from '../../identity/presentation/decorators/require-permissions.decorator';

@Controller('accounting/audit')
@UseGuards(SessionAuthGuard, PermissionsGuard)
export class AccountingAuditController {
  constructor(private readonly auditService: AccountingAuditService) {}

  /** GET /api/v1/accounting/audit?view=DESCUADRADOS|ANULADOS&fromDate&toDate&documentType */
  @Get()
  @RequirePermissions(SYSTEM_PERMISSIONS.ACCOUNTING_READ)
  audit(
    @Query(
      new QueryShapeValidationPipe({
        view: { values: ['DESCUADRADOS', 'ANULADOS'] },
        fromDate: 'date?',
        toDate: 'date?',
        documentType: 'text?',
      }),
    )
    query: Record<string, string>,
  ): Promise<AccountingAuditDto> {
    return this.auditService.audit({
      view: query['view'] as AccountingAuditView,
      fromDate: query['fromDate'],
      toDate: query['toDate'],
      documentType: query['documentType'],
    });
  }
}
