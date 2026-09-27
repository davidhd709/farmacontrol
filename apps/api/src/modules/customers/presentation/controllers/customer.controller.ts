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
} from '@nestjs/common';
import type { Request } from 'express';
import {
  SYSTEM_PERMISSIONS,
  CustomerDto,
  CustomerQueryFilters,
  PaginatedResponse,
} from '@farmacia/contracts';
import { CustomerService } from '../../application/customer.service';
import {
  CreateCustomerDto,
  CreateCustomerValidationPipe,
} from '../dtos/create-customer.dto';
import {
  UpdateCustomerDto,
  UpdateCustomerValidationPipe,
} from '../dtos/update-customer.dto';
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
} from '../../domain/customer.exceptions';

@Controller('customers')
@UseGuards(SessionAuthGuard, PermissionsGuard)
export class CustomerController {
  constructor(private readonly customerService: CustomerService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @RequirePermissions(SYSTEM_PERMISSIONS.CUSTOMERS_MANAGE)
  public async create(
    @Body(CreateCustomerValidationPipe) dto: CreateCustomerDto,
    @CurrentUser() user: AuthenticatedUserContext,
    @Req() req: Request
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
      if (error instanceof Error) {
        throw new BadRequestException(error.message);
      }
      throw error;
    }
  }

  @Get()
  @RequirePermissions(SYSTEM_PERMISSIONS.CUSTOMERS_READ)
  public async findAll(
    @Query(CustomerQueryValidationPipe) query: CustomerQueryFilters
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
  public async findOne(@Param('id') id: string): Promise<CustomerDto> {
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
    @Param('id') id: string,
    @Body(UpdateCustomerValidationPipe) dto: UpdateCustomerDto,
    @CurrentUser() user: AuthenticatedUserContext,
    @Req() req: Request
  ): Promise<CustomerDto> {
    try {
      const customer = await this.customerService.updateCustomer(id, dto, {
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
      if (error instanceof Error) {
        throw new BadRequestException(error.message);
      }
      throw error;
    }
  }

  @Delete(':id')
  @RequirePermissions(SYSTEM_PERMISSIONS.CUSTOMERS_MANAGE)
  public async remove(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUserContext,
    @Req() req: Request
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
