import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  SYSTEM_PERMISSIONS,
  type DocumentLockDto,
  type DocumentLockStatusDto,
  type SetDocumentLockPayload,
} from '@farmacia/contracts';
import { DocumentLockService } from '../application/document-lock.service';
import { AccountingValidationError } from '../domain/accounting-rules';
import { SessionAuthGuard } from '../../identity/presentation/guards/session-auth.guard';
import { PermissionsGuard } from '../../identity/presentation/guards/permissions.guard';
import { RequirePermissions } from '../../identity/presentation/decorators/require-permissions.decorator';
import { CurrentUser } from '../../identity/presentation/decorators/current-user.decorator';
import type { AuthenticatedUserContext } from '../../identity/presentation/guards/session-auth.guard';

@Controller('accounting/document-lock')
@UseGuards(SessionAuthGuard, PermissionsGuard)
export class DocumentLockController {
  constructor(private readonly documentLockService: DocumentLockService) {}

  @Get()
  @RequirePermissions(SYSTEM_PERMISSIONS.ACCOUNTING_READ)
  getStatus(): Promise<DocumentLockStatusDto> {
    return this.documentLockService.getStatus();
  }

  @Post()
  @RequirePermissions(SYSTEM_PERMISSIONS.ACCOUNTING_MANAGE)
  async setLock(
    @Body() body: SetDocumentLockPayload,
    @CurrentUser() user: AuthenticatedUserContext,
  ): Promise<DocumentLockDto> {
    try {
      return await this.documentLockService.setLock(body, user.id);
    } catch (error) {
      if (error instanceof AccountingValidationError) throw new BadRequestException(error.message);
      throw error;
    }
  }
}
