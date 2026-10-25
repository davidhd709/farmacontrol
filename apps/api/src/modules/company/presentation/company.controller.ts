import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiOperation, ApiResponse } from '@nestjs/swagger';
import type { Request } from 'express';
import {
  SYSTEM_PERMISSIONS,
  type AccountingPolicyDto,
  type BranchDto,
  type CompanyDto,
  type CompanySettingsDto,
  type CreateAccountingPolicyPayload,
  type CreateBranchPayload,
  type SetupCompanyPayload,
  type UpdateCompanyPayload,
} from '@farmacia/contracts';
import { CompanyService, type CompanyAuditContext } from '../application/company.service';
import { SessionAuthGuard } from '../../identity/presentation/guards/session-auth.guard';
import { PermissionsGuard } from '../../identity/presentation/guards/permissions.guard';
import { RequirePermissions } from '../../identity/presentation/decorators/require-permissions.decorator';
import { CurrentUser } from '../../identity/presentation/decorators/current-user.decorator';
import type { AuthenticatedUserContext } from '../../identity/presentation/guards/session-auth.guard';

function body<T>(value: unknown): T {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new BadRequestException('El cuerpo de la solicitud debe ser un objeto JSON válido.');
  }
  return value as T;
}

function auditContext(req: Request, user: AuthenticatedUserContext): CompanyAuditContext {
  return {
    userId: user.id,
    ipAddress: req.ip || req.socket.remoteAddress || null,
    correlationId: (req.headers['x-correlation-id'] as string) || null,
  };
}

/** Empresa, sucursales y políticas contables versionadas (ADR-006, F3). */
@Controller('company')
@UseGuards(SessionAuthGuard, PermissionsGuard)
export class CompanyController {
  constructor(private readonly companyService: CompanyService) {}

  @Get()
  @RequirePermissions(SYSTEM_PERMISSIONS.COMPANY_READ)
  @ApiOperation({ summary: 'Empresa, sucursales y política contable vigente con su historial' })
  getSettings(): Promise<CompanySettingsDto> {
    return this.companyService.getSettings();
  }

  @Post('setup')
  @RequirePermissions(SYSTEM_PERMISSIONS.COMPANY_MANAGE)
  @ApiResponse({
    status: 400,
    description: 'Datos inválidos o NIT con dígito de verificación incorrecto.',
  })
  @ApiResponse({ status: 409, description: 'La empresa ya está configurada.' })
  setup(
    @Body() payload: unknown,
    @Req() req: Request,
    @CurrentUser() user: AuthenticatedUserContext,
  ): Promise<CompanyDto> {
    return this.companyService.setup(body<SetupCompanyPayload>(payload), auditContext(req, user));
  }

  @Patch()
  @RequirePermissions(SYSTEM_PERMISSIONS.COMPANY_MANAGE)
  @ApiResponse({ status: 404, description: 'La empresa aún no está configurada.' })
  update(
    @Body() payload: unknown,
    @Req() req: Request,
    @CurrentUser() user: AuthenticatedUserContext,
  ): Promise<CompanyDto> {
    return this.companyService.update(body<UpdateCompanyPayload>(payload), auditContext(req, user));
  }

  @Post('branches')
  @RequirePermissions(SYSTEM_PERMISSIONS.COMPANY_MANAGE)
  @ApiResponse({ status: 409, description: 'Ya existe una sucursal con ese código.' })
  createBranch(
    @Body() payload: unknown,
    @Req() req: Request,
    @CurrentUser() user: AuthenticatedUserContext,
  ): Promise<BranchDto> {
    return this.companyService.createBranch(
      body<CreateBranchPayload>(payload),
      auditContext(req, user),
    );
  }

  @Post('accounting-policies')
  @HttpCode(HttpStatus.CREATED)
  @RequirePermissions(SYSTEM_PERMISSIONS.COMPANY_MANAGE)
  @ApiOperation({
    summary: 'Registra una versión nueva de la política contable con vigencia desde hoy o después',
  })
  @ApiResponse({ status: 400, description: 'Valores no válidos o vigencia anterior a hoy.' })
  @ApiResponse({
    status: 409,
    description: 'Ya existe una versión con esa vigencia o el cambio requiere revaluación.',
  })
  createPolicy(
    @Body() payload: unknown,
    @Req() req: Request,
    @CurrentUser() user: AuthenticatedUserContext,
  ): Promise<AccountingPolicyDto> {
    return this.companyService.createPolicy(
      body<CreateAccountingPolicyPayload>(payload),
      auditContext(req, user),
    );
  }
}
