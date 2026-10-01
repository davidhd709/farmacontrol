import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Param,
  Patch,
  Post,
  Put,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import { Prisma } from '@farmacia/database';
import {
  SYSTEM_PERMISSIONS,
  AccountInput,
  AccountDto,
  AccountingPurposeDto,
  AccountingConfigurationStatusDto,
  AccountImportPreviewDto,
} from '@farmacia/contracts';
import { AccountingService } from '../application/accounting.service';
import {
  AccountingConflictError,
  AccountingNotFoundError,
  AccountingValidationError,
} from '../domain/accounting-rules';
import { SessionAuthGuard } from '../../identity/presentation/guards/session-auth.guard';
import { PermissionsGuard } from '../../identity/presentation/guards/permissions.guard';
import { RequirePermissions } from '../../identity/presentation/decorators/require-permissions.decorator';
import { CurrentUser } from '../../identity/presentation/decorators/current-user.decorator';
import type { AuthenticatedUserContext } from '../../identity/presentation/guards/session-auth.guard';

function httpError(error: unknown): never {
  if (error instanceof AccountingNotFoundError) throw new NotFoundException(error.message);
  if (
    error instanceof AccountingConflictError ||
    (error instanceof Prisma.PrismaClientKnownRequestError &&
      (error.code === 'P2002' || error.code === 'P2034'))
  )
    throw new ConflictException(error instanceof Error ? error.message : 'Conflicto de datos.');
  if (error instanceof AccountingValidationError) throw new BadRequestException(error.message);
  throw error;
}

function uploadedBuffer(file?: { buffer: Buffer; originalname: string; size: number }): Buffer {
  if (
    !file ||
    !file.originalname.toLowerCase().endsWith('.xlsx') ||
    file.size > 2 * 1024 * 1024 ||
    !file.buffer
  )
    throw new BadRequestException('Adjunte un archivo .xlsx de máximo 2 MB.');
  return file.buffer;
}

@Controller('accounts')
@UseGuards(SessionAuthGuard, PermissionsGuard)
export class AccountsController {
  constructor(private readonly service: AccountingService) {}

  @Get()
  @RequirePermissions(SYSTEM_PERMISSIONS.ACCOUNTING_READ)
  list(): Promise<AccountDto[]> {
    return this.service.listAccounts();
  }

  @Post()
  @RequirePermissions(SYSTEM_PERMISSIONS.ACCOUNTING_MANAGE)
  async create(
    @Body() body: AccountInput,
    @CurrentUser() user: AuthenticatedUserContext,
  ): Promise<AccountDto> {
    try {
      return await this.service.createAccount(body, user.id);
    } catch (error) {
      return httpError(error);
    }
  }

  @Patch(':id')
  @RequirePermissions(SYSTEM_PERMISSIONS.ACCOUNTING_MANAGE)
  async update(
    @Param('id') id: string,
    @Body() body: Partial<AccountInput>,
    @CurrentUser() user: AuthenticatedUserContext,
  ): Promise<AccountDto> {
    try {
      return await this.service.updateAccount(id, body, user.id);
    } catch (error) {
      return httpError(error);
    }
  }

  @Get('import/template')
  @RequirePermissions(SYSTEM_PERMISSIONS.ACCOUNTING_READ)
  async template(@Res() response: Response): Promise<void> {
    const buffer = await this.service.template();
    response.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    response.setHeader('Content-Disposition', 'attachment; filename="plan-cuentas.xlsx"');
    response.send(buffer);
  }

  @Post('import/preview')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 2 * 1024 * 1024 } }))
  @RequirePermissions(SYSTEM_PERMISSIONS.ACCOUNTING_MANAGE)
  async preview(
    @UploadedFile() file?: { buffer: Buffer; originalname: string; size: number },
  ): Promise<AccountImportPreviewDto> {
    try {
      return await this.service.preview(uploadedBuffer(file));
    } catch (error) {
      return httpError(error);
    }
  }

  @Post('import/confirm')
  @HttpCode(HttpStatus.OK)
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 2 * 1024 * 1024 } }))
  @RequirePermissions(SYSTEM_PERMISSIONS.ACCOUNTING_MANAGE)
  async confirm(
    @UploadedFile() file: { buffer: Buffer; originalname: string; size: number } | undefined,
    @Body('previewHash') hash: string,
    @CurrentUser() user: AuthenticatedUserContext,
  ): Promise<{ importedCount: number }> {
    try {
      return await this.service.confirm(uploadedBuffer(file), hash, user.id);
    } catch (error) {
      return httpError(error);
    }
  }
}

@Controller('accounting')
@UseGuards(SessionAuthGuard, PermissionsGuard)
export class AccountingConfigurationController {
  constructor(private readonly service: AccountingService) {}

  @Get('purposes')
  @RequirePermissions(SYSTEM_PERMISSIONS.ACCOUNTING_READ)
  purposes(): Promise<AccountingPurposeDto[]> {
    return this.service.listMappings();
  }

  @Put('purposes/:purpose')
  @RequirePermissions(SYSTEM_PERMISSIONS.ACCOUNTING_MANAGE)
  async map(
    @Param('purpose') purpose: string,
    @Body() body: { accountId: string | null },
    @CurrentUser() user: AuthenticatedUserContext,
  ): Promise<AccountingPurposeDto> {
    if (!body || !Object.prototype.hasOwnProperty.call(body, 'accountId'))
      throw new BadRequestException('accountId es requerido.');
    try {
      return await this.service.mapPurpose(purpose, body.accountId, user.id);
    } catch (error) {
      return httpError(error);
    }
  }

  @Get('configuration-status')
  @RequirePermissions(SYSTEM_PERMISSIONS.ACCOUNTING_READ)
  status(): Promise<AccountingConfigurationStatusDto> {
    return this.service.configurationStatus();
  }
}
