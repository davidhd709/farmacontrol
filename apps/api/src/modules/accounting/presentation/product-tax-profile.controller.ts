import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Get,
  NotFoundException,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { Prisma } from '@farmacia/database';
import {
  SYSTEM_PERMISSIONS,
  type ProductTaxProfileDto,
  type ProductTaxProfileInput,
  type UpdateProductTaxProfileInput,
} from '@farmacia/contracts';
import { ProductTaxProfileService } from '../application/product-tax-profile.service';
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
  if (error instanceof AccountingValidationError) throw new BadRequestException(error.message);
  if (
    error instanceof AccountingConflictError ||
    (error instanceof Prisma.PrismaClientKnownRequestError &&
      ['P2002', 'P2004', 'P2034'].includes(error.code))
  )
    throw new ConflictException(error instanceof Error ? error.message : 'Conflicto de datos.');
  throw error;
}

@Controller('accounting/tax-profiles')
@UseGuards(SessionAuthGuard, PermissionsGuard)
export class ProductTaxProfileController {
  constructor(private readonly service: ProductTaxProfileService) {}

  @Post()
  @RequirePermissions(SYSTEM_PERMISSIONS.ACCOUNTING_MANAGE)
  async create(
    @Body() body: ProductTaxProfileInput,
    @CurrentUser() user: AuthenticatedUserContext,
  ): Promise<ProductTaxProfileDto> {
    try {
      return await this.service.create(body, user.id);
    } catch (error) {
      return httpError(error);
    }
  }

  @Get()
  @RequirePermissions(SYSTEM_PERMISSIONS.ACCOUNTING_READ)
  async list(
    @Query('productId') productId: string,
    @Query('operation') operation?: string,
  ): Promise<ProductTaxProfileDto[]> {
    try {
      return await this.service.list(productId, operation);
    } catch (error) {
      return httpError(error);
    }
  }

  @Get('effective')
  @RequirePermissions(SYSTEM_PERMISSIONS.ACCOUNTING_READ)
  async effective(
    @Query('productId') productId: string,
    @Query('operation') operation: string,
    @Query('date') date: string,
  ): Promise<ProductTaxProfileDto> {
    try {
      return await this.service.effective(productId, operation, date);
    } catch (error) {
      return httpError(error);
    }
  }

  @Patch(':id')
  @RequirePermissions(SYSTEM_PERMISSIONS.ACCOUNTING_MANAGE)
  async update(
    @Param('id') id: string,
    @Body() body: UpdateProductTaxProfileInput,
    @CurrentUser() user: AuthenticatedUserContext,
  ): Promise<ProductTaxProfileDto> {
    try {
      return await this.service.update(id, body, user.id);
    } catch (error) {
      return httpError(error);
    }
  }

  @Post(':id/activate')
  @RequirePermissions(SYSTEM_PERMISSIONS.ACCOUNTING_MANAGE)
  async activate(
    @Param('id') id: string,
    @Body() body: unknown,
    @CurrentUser() user: AuthenticatedUserContext,
  ): Promise<ProductTaxProfileDto> {
    if (body && (typeof body !== 'object' || Array.isArray(body) || Object.keys(body).length))
      throw new BadRequestException('La activación no acepta campos adicionales.');
    try {
      return await this.service.activate(id, user.id);
    } catch (error) {
      return httpError(error);
    }
  }
}
