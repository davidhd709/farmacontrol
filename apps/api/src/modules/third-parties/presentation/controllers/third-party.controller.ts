import { QueryShapeValidationPipe } from '../../../../common/pagination/request-shape.pipe';
import {
  Controller,
  Get,
  Post,
  Put,
  Patch,
  Body,
  Param,
  Query,
  Req,
  UseGuards,
  HttpCode,
  HttpStatus,
  NotFoundException,
  ConflictException,
  BadRequestException,
  ParseUUIDPipe,
} from '@nestjs/common';
import type { Request } from 'express';
import {
  SYSTEM_PERMISSIONS,
  ThirdPartyDto,
  ThirdPartyQueryFilters,
  PaginatedResponse,
} from '@farmacia/contracts';
import { ThirdPartyService } from '../../application/third-party.service';
import {
  CreateThirdPartyDto,
  CreateThirdPartyValidationPipe,
} from '../dtos/create-third-party.dto';
import {
  UpdateThirdPartyDto,
  UpdateThirdPartyValidationPipe,
} from '../dtos/update-third-party.dto';
import { ThirdPartyQueryValidationPipe } from '../dtos/third-party-query.dto';
import {
  SessionAuthGuard,
  AuthenticatedUserContext,
} from '../../../identity/presentation/guards/session-auth.guard';
import { PermissionsGuard } from '../../../identity/presentation/guards/permissions.guard';
import {
  RequireAnyPermissions,
  RequirePermissions,
} from '../../../identity/presentation/decorators/require-permissions.decorator';
import { thirdPartyAccess } from '../../application/third-party-access';
import { CurrentUser } from '../../../identity/presentation/decorators/current-user.decorator';
import {
  ThirdPartyNotFoundException,
  ThirdPartyAlreadyExistsException,
  ThirdPartyDocumentChangeForbiddenException,
} from '../../domain/third-party.exceptions';
import { DomainError } from '../../../../common/domain-error';

/** Lectura y escritura con todo tipo de tercero, o limitadas a clientes o a proveedores. */
const READ_ANY = [
  SYSTEM_PERMISSIONS.THIRD_PARTIES_READ,
  SYSTEM_PERMISSIONS.CUSTOMERS_MANAGE,
  SYSTEM_PERMISSIONS.SUPPLIERS_MANAGE,
  // Selección del tercero en egresos y recibos manuales (tesorería), solo lectura
  SYSTEM_PERMISSIONS.DISBURSEMENTS_CREATE,
  SYSTEM_PERMISSIONS.CASH_RECEIPTS_MANUAL,
];
const WRITE_ANY = [
  SYSTEM_PERMISSIONS.THIRD_PARTIES_MANAGE,
  SYSTEM_PERMISSIONS.CUSTOMERS_MANAGE,
  SYSTEM_PERMISSIONS.SUPPLIERS_MANAGE,
];

/**
 * Directorio de terceros (correcciones del cliente, 2026-11-03): cartera ve y edita solo
 * clientes, compras solo proveedores; el servicio aplica ese alcance aunque se cambie el filtro.
 * Desactivar y reactivar exige `third_parties:deactivate` (solo admin).
 */
@Controller('third-parties')
@UseGuards(SessionAuthGuard, PermissionsGuard)
export class ThirdPartyController {
  constructor(private readonly thirdPartyService: ThirdPartyService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @RequireAnyPermissions(...WRITE_ANY)
  public async create(
    @Body(CreateThirdPartyValidationPipe) dto: CreateThirdPartyDto,
    @CurrentUser() user: AuthenticatedUserContext,
    @Req() req: Request,
  ): Promise<ThirdPartyDto> {
    try {
      const thirdParty = await this.thirdPartyService.createThirdParty(
        dto,
        {
          userId: user.id,
          ipAddress: req.ip,
          correlationId: req.headers['x-correlation-id'] as string | undefined,
        },
        thirdPartyAccess(user.permissions, 'write'),
      );
      return thirdParty.toDto();
    } catch (error) {
      if (error instanceof ThirdPartyAlreadyExistsException) {
        throw new ConflictException(error.message);
      }
      if (error instanceof DomainError && error.kind === 'validation') {
        throw new BadRequestException(error.message);
      }
      throw error;
    }
  }

  @Get()
  @RequireAnyPermissions(...READ_ANY)
  public async findPaginated(
    @Query(
      new QueryShapeValidationPipe({ search: 'text?', role: 'text?', isActive: 'booleanString?' }),
      ThirdPartyQueryValidationPipe,
    )
    filters: ThirdPartyQueryFilters,
    @CurrentUser() user: AuthenticatedUserContext,
  ): Promise<PaginatedResponse<ThirdPartyDto>> {
    return this.thirdPartyService.findPaginated(filters, thirdPartyAccess(user.permissions, 'read'));
  }

  @Get(':id')
  @RequireAnyPermissions(...READ_ANY)
  public async getById(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUserContext,
  ): Promise<ThirdPartyDto> {
    try {
      const thirdParty = await this.thirdPartyService.getThirdPartyById(
        id,
        thirdPartyAccess(user.permissions, 'read'),
      );
      return thirdParty.toDto();
    } catch (error) {
      if (error instanceof ThirdPartyNotFoundException) {
        throw new NotFoundException(error.message);
      }
      throw error;
    }
  }

  @Put(':id')
  @RequireAnyPermissions(...WRITE_ANY)
  public async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(UpdateThirdPartyValidationPipe) dto: UpdateThirdPartyDto,
    @CurrentUser() user: AuthenticatedUserContext,
    @Req() req: Request,
  ): Promise<ThirdPartyDto> {
    try {
      const thirdParty = await this.thirdPartyService.updateThirdParty(
        id,
        dto,
        {
          userId: user.id,
          ipAddress: req.ip,
          correlationId: req.headers['x-correlation-id'] as string | undefined,
        },
        thirdPartyAccess(user.permissions, 'write'),
      );
      return thirdParty.toDto();
    } catch (error) {
      if (error instanceof ThirdPartyNotFoundException) {
        throw new NotFoundException(error.message);
      }
      if (error instanceof ThirdPartyDocumentChangeForbiddenException) {
        throw new BadRequestException(error.message);
      }
      if (error instanceof DomainError && error.kind === 'validation') {
        throw new BadRequestException(error.message);
      }
      throw error;
    }
  }

  @Patch(':id/deactivate')
  @RequirePermissions(SYSTEM_PERMISSIONS.THIRD_PARTIES_DEACTIVATE)
  public async deactivate(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUserContext,
    @Req() req: Request,
  ): Promise<ThirdPartyDto> {
    try {
      const thirdParty = await this.thirdPartyService.deactivateThirdParty(id, {
        userId: user.id,
        ipAddress: req.ip,
        correlationId: req.headers['x-correlation-id'] as string | undefined,
      });
      return thirdParty.toDto();
    } catch (error) {
      if (error instanceof ThirdPartyNotFoundException) {
        throw new NotFoundException(error.message);
      }
      throw error;
    }
  }

  @Patch(':id/activate')
  @RequirePermissions(SYSTEM_PERMISSIONS.THIRD_PARTIES_DEACTIVATE)
  public async activate(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUserContext,
    @Req() req: Request,
  ): Promise<ThirdPartyDto> {
    try {
      const thirdParty = await this.thirdPartyService.activateThirdParty(id, {
        userId: user.id,
        ipAddress: req.ip,
        correlationId: req.headers['x-correlation-id'] as string | undefined,
      });
      return thirdParty.toDto();
    } catch (error) {
      if (error instanceof ThirdPartyNotFoundException) {
        throw new NotFoundException(error.message);
      }
      throw error;
    }
  }
}
