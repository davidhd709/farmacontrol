import { QueryShapeValidationPipe } from '../../../../common/pagination/request-shape.pipe';
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
  ParseUUIDPipe,
} from '@nestjs/common';
import type { Request } from 'express';
import {
  SYSTEM_PERMISSIONS,
  CustomerDto,
  CustomerQueryFilters,
  PaginatedResponse,
} from '@farmacia/contracts';
import { CustomerService } from '../../application/customer.service';
import { CreateCustomerDto, CreateCustomerValidationPipe } from '../dtos/create-customer.dto';
import { UpdateCustomerDto, UpdateCustomerValidationPipe } from '../dtos/update-customer.dto';
import { CustomerQueryValidationPipe } from '../dtos/customer-query.dto';
import {
  SessionAuthGuard,
  AuthenticatedUserContext,
} from '../../../identity/presentation/guards/session-auth.guard';
import { PermissionsGuard } from '../../../identity/presentation/guards/permissions.guard';
import { RequirePermissions } from '../../../identity/presentation/decorators/require-permissions.decorator';
import { CurrentUser } from '../../../identity/presentation/decorators/current-user.decorator';
import {
  CustomerNotFoundException,
  CustomerAlreadyExistsException,
  CustomerCannotBeDeactivatedException,
  CustomerDocumentChangeForbiddenException,
} from '../../domain/customer.exceptions';

@Controller('customers')
@UseGuards(SessionAuthGuard, PermissionsGuard)
export class CustomerController {
  constructor(private readonly customerService: CustomerService) {}

  /** Crear clientes (también el cajero, desde el POS). Editar exige customers:manage. */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  @RequirePermissions(SYSTEM_PERMISSIONS.CUSTOMERS_CREATE)
  public async create(
    @Body(CreateCustomerValidationPipe) dto: CreateCustomerDto,
    @CurrentUser() user: AuthenticatedUserContext,
    @Req() req: Request,
  ): Promise<CustomerDto> {
    try {
      const customer = await this.customerService.createCustomer(dto, {
        userId: user.id,
        ipAddress: req.ip,
        correlationId: req.headers['x-correlation-id'] as string | undefined,
      });
      return customer.toDto();
    } catch (error) {
      if (error instanceof CustomerAlreadyExistsException) {
        throw new ConflictException(error.message);
      }
      throw error;
    }
  }

  @Get()
  @RequirePermissions(SYSTEM_PERMISSIONS.CUSTOMERS_READ)
  public async findAll(
    @Query(
      new QueryShapeValidationPipe({ search: 'text?', isActive: 'booleanString?' }),
      CustomerQueryValidationPipe,
    )
    query: CustomerQueryFilters,
  ): Promise<PaginatedResponse<CustomerDto>> {
    return this.customerService.getCustomers(query);
  }

  @Get('default')
  @RequirePermissions(SYSTEM_PERMISSIONS.CUSTOMERS_READ)
  public async findDefault(): Promise<CustomerDto> {
    try {
      const customer = await this.customerService.getDefaultCustomer();
      return customer.toDto();
    } catch (error) {
      if (error instanceof CustomerNotFoundException) {
        throw new NotFoundException(error.message);
      }
      throw error;
    }
  }

  @Get(':id')
  @RequirePermissions(SYSTEM_PERMISSIONS.CUSTOMERS_READ)
  public async findOne(@Param('id', ParseUUIDPipe) id: string): Promise<CustomerDto> {
    try {
      const customer = await this.customerService.getCustomerById(id);
      return customer.toDto();
    } catch (error) {
      if (error instanceof CustomerNotFoundException) {
        throw new NotFoundException(error.message);
      }
      throw error;
    }
  }

  @Put(':id')
  @RequirePermissions(SYSTEM_PERMISSIONS.CUSTOMERS_MANAGE)
  public async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(UpdateCustomerValidationPipe) dto: UpdateCustomerDto,
    @CurrentUser() user: AuthenticatedUserContext,
    @Req() req: Request,
  ): Promise<CustomerDto> {
    try {
      // Activar o desactivar por esta vía exige el mismo permiso que DELETE
      if (
        dto.isActive !== undefined &&
        !user.permissions.includes(SYSTEM_PERMISSIONS.THIRD_PARTIES_DEACTIVATE) &&
        (await this.customerService.getCustomerById(id)).isActive !== dto.isActive
      ) {
        throw new ForbiddenException('Solo un administrador puede desactivar o reactivar clientes.');
      }
      const customer = await this.customerService.updateCustomer(id, dto, {
        userId: user.id,
        roles: user.roles,
        ipAddress: req.ip,
        correlationId: req.headers['x-correlation-id'] as string | undefined,
      });
      return customer.toDto();
    } catch (error) {
      if (error instanceof CustomerNotFoundException) {
        throw new NotFoundException(error.message);
      }
      if (error instanceof CustomerCannotBeDeactivatedException) {
        throw new BadRequestException(error.message);
      }
      if (error instanceof CustomerDocumentChangeForbiddenException) {
        throw new ForbiddenException(error.message);
      }
      if (error instanceof CustomerAlreadyExistsException) {
        throw new ConflictException(error.message);
      }
      throw error;
    }
  }

  @Delete(':id')
  @RequirePermissions(SYSTEM_PERMISSIONS.THIRD_PARTIES_DEACTIVATE)
  public async remove(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUserContext,
    @Req() req: Request,
  ): Promise<CustomerDto> {
    try {
      const customer = await this.customerService.deactivateCustomer(id, {
        userId: user.id,
        ipAddress: req.ip,
        correlationId: req.headers['x-correlation-id'] as string | undefined,
      });
      return customer.toDto();
    } catch (error) {
      if (error instanceof CustomerNotFoundException) {
        throw new NotFoundException(error.message);
      }
      if (error instanceof CustomerCannotBeDeactivatedException) {
        throw new BadRequestException(error.message);
      }
      throw error;
    }
  }
}
