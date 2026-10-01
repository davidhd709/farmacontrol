import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
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
  ForbiddenException,
} from '@nestjs/common';
import type { Request } from 'express';
import { SYSTEM_PERMISSIONS, SupplierDto, PaginatedResponse } from '@farmacia/contracts';
import { SupplierService } from '../../application/supplier.service';
import { CreateSupplierDto, CreateSupplierValidationPipe } from '../dtos/create-supplier.dto';
import { UpdateSupplierDto, UpdateSupplierValidationPipe } from '../dtos/update-supplier.dto';
import { SupplierQueryValidationPipe } from '../dtos/supplier-query.dto';
import {
  SessionAuthGuard,
  AuthenticatedUserContext,
} from '../../../identity/presentation/guards/session-auth.guard';
import { PermissionsGuard } from '../../../identity/presentation/guards/permissions.guard';
import { RequirePermissions } from '../../../identity/presentation/decorators/require-permissions.decorator';
import { CurrentUser } from '../../../identity/presentation/decorators/current-user.decorator';
import {
  SupplierNotFoundException,
  SupplierAlreadyExistsException,
  SupplierTaxIdChangeForbiddenException,
} from '../../domain/supplier.exceptions';

@Controller('suppliers')
@UseGuards(SessionAuthGuard, PermissionsGuard)
export class SupplierController {
  constructor(private readonly supplierService: SupplierService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @RequirePermissions(SYSTEM_PERMISSIONS.SUPPLIERS_MANAGE)
  public async create(
    @Body(CreateSupplierValidationPipe) dto: CreateSupplierDto,
    @CurrentUser() user: AuthenticatedUserContext,
    @Req() req: Request,
  ): Promise<SupplierDto> {
    try {
      const supplier = await this.supplierService.createSupplier(dto, {
        userId: user.id,
        ipAddress: req.ip,
        correlationId: req.headers['x-correlation-id'] as string | undefined,
      });
      return supplier.toDto();
    } catch (error) {
      if (error instanceof SupplierAlreadyExistsException) {
        throw new ConflictException(error.message);
      }
      if (error instanceof Error) {
        throw new BadRequestException(error.message);
      }
      throw error;
    }
  }

  @Get()
  @RequirePermissions(SYSTEM_PERMISSIONS.SUPPLIERS_READ)
  public async findAll(
    @Query(SupplierQueryValidationPipe) query: any,
  ): Promise<PaginatedResponse<SupplierDto>> {
    return this.supplierService.getSuppliers(query);
  }

  @Get(':id')
  @RequirePermissions(SYSTEM_PERMISSIONS.SUPPLIERS_READ)
  public async findOne(@Param('id') id: string): Promise<SupplierDto> {
    try {
      const supplier = await this.supplierService.getSupplierById(id);
      return supplier.toDto();
    } catch (error) {
      if (error instanceof SupplierNotFoundException) {
        throw new NotFoundException(error.message);
      }
      throw error;
    }
  }

  @Put(':id')
  @RequirePermissions(SYSTEM_PERMISSIONS.SUPPLIERS_MANAGE)
  public async update(
    @Param('id') id: string,
    @Body(UpdateSupplierValidationPipe) dto: UpdateSupplierDto,
    @CurrentUser() user: AuthenticatedUserContext,
    @Req() req: Request,
  ): Promise<SupplierDto> {
    try {
      const supplier = await this.supplierService.updateSupplier(id, dto, {
        userId: user.id,
        roles: user.roles,
        ipAddress: req.ip,
        correlationId: req.headers['x-correlation-id'] as string | undefined,
      });
      return supplier.toDto();
    } catch (error) {
      if (error instanceof SupplierNotFoundException) {
        throw new NotFoundException(error.message);
      }
      if (error instanceof SupplierAlreadyExistsException) {
        throw new ConflictException(error.message);
      }
      if (error instanceof SupplierTaxIdChangeForbiddenException) {
        throw new ForbiddenException(error.message);
      }
      if (error instanceof Error) {
        throw new BadRequestException(error.message);
      }
      throw error;
    }
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(SYSTEM_PERMISSIONS.SUPPLIERS_MANAGE)
  public async deactivate(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUserContext,
    @Req() req: Request,
  ): Promise<SupplierDto> {
    try {
      const supplier = await this.supplierService.deactivateSupplier(id, {
        userId: user.id,
        ipAddress: req.ip,
        correlationId: req.headers['x-correlation-id'] as string | undefined,
      });
      return supplier.toDto();
    } catch (error) {
      if (error instanceof SupplierNotFoundException) {
        throw new NotFoundException(error.message);
      }
      throw error;
    }
  }
}
