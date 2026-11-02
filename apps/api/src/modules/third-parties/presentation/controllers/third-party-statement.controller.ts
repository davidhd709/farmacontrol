import { Controller, Get, Param, ParseUUIDPipe, UseGuards } from '@nestjs/common';
import { SYSTEM_PERMISSIONS, type ThirdPartyStatementDto } from '@farmacia/contracts';
import { ThirdPartyStatementService } from '../../application/third-party-statement.service';
import { SessionAuthGuard } from '../../../identity/presentation/guards/session-auth.guard';
import { PermissionsGuard } from '../../../identity/presentation/guards/permissions.guard';
import { RequirePermissions } from '../../../identity/presentation/decorators/require-permissions.decorator';

@Controller('third-parties')
@UseGuards(SessionAuthGuard, PermissionsGuard)
export class ThirdPartyStatementController {
  constructor(private readonly statementService: ThirdPartyStatementService) {}

  /** GET /api/v1/third-parties/:id/statement: lo que nos debe y lo que le debemos. */
  @Get(':id/statement')
  @RequirePermissions(SYSTEM_PERMISSIONS.ACCOUNTING_READ)
  getStatement(@Param('id', ParseUUIDPipe) id: string): Promise<ThirdPartyStatementDto> {
    return this.statementService.getStatement(id);
  }
}
