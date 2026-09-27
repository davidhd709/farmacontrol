import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { SYSTEM_PERMISSIONS } from '@farmacia/contracts';
import type {
  BackupSummaryDto,
  CreateBackupResultDto,
  VerifyBackupResultDto,
} from '@farmacia/contracts';
import { SessionAuthGuard } from '../../identity/presentation/guards/session-auth.guard';
import { PermissionsGuard } from '../../identity/presentation/guards/permissions.guard';
import { RequirePermissions } from '../../identity/presentation/decorators/require-permissions.decorator';
import { BackupsService } from '../application/backups.service';

@Controller('backups')
@UseGuards(SessionAuthGuard, PermissionsGuard)
export class BackupsController {
  constructor(private readonly backupsService: BackupsService) {}

  @Get('status')
  @RequirePermissions(SYSTEM_PERMISSIONS.BACKUPS_MANAGE)
  async getStatus(): Promise<BackupSummaryDto> {
    return this.backupsService.getBackupStatus();
  }

  @Post('create')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(SYSTEM_PERMISSIONS.BACKUPS_MANAGE)
  async createBackup(): Promise<CreateBackupResultDto> {
    return this.backupsService.createBackup();
  }

  @Post(':filename/verify')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(SYSTEM_PERMISSIONS.BACKUPS_MANAGE)
  async verifyBackup(
    @Param('filename') filename: string,
  ): Promise<VerifyBackupResultDto> {
    return this.backupsService.verifyBackup(filename);
  }
}
