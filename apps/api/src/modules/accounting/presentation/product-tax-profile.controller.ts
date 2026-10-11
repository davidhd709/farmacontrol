import {
  RequestShapeValidationPipe,
  QueryFieldValidationPipe,
} from '../../../common/pagination/request-shape.pipe';
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
  ParseUUIDPipe,
} from '@nestjs/common';
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
  // Los errores de Prisma siguen al filtro global, que responde 409 sin exponer su mensaje.
  if (error instanceof AccountingConflictError) throw new ConflictException(error.message);
  throw error;
}

@Controller('accounting/tax-profiles')
@UseGuards(SessionAuthGuard, PermissionsGuard)
export class ProductTaxProfileController {
  constructor(private readonly service: ProductTaxProfileService) {}

  @Post()
  @RequirePermissions(SYSTEM_PERMISSIONS.ACCOUNTING_MANAGE)
  async create(
    @Body(
      new RequestShapeValidationPipe({
        productId: 'uuid',
        operation: { values: ['SALE', 'PURCHASE'] },
        treatment: { values: ['GRAVADO', 'EXENTO', 'EXCLUIDO', 'NO_APLICA'] },
        ratePct: 'decimal?',
        effectiveFrom: 'date',
        effectiveTo: 'date?',
        documentReference: 'text?',
      }),
    )
    body: ProductTaxProfileInput,
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
    @Query('productId', new QueryFieldValidationPipe('productId', 'uuid')) productId: string,
    @Query('operation', new QueryFieldValidationPipe('operation', 'text?')) operation?: string,
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
    @Query('productId', new QueryFieldValidationPipe('productId', 'uuid')) productId: string,
    @Query('operation', new QueryFieldValidationPipe('operation', 'text')) operation: string,
    @Query('date', new QueryFieldValidationPipe('date', 'date')) date: string,
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
    @Param('id', ParseUUIDPipe) id: string,
    @Body(
      new RequestShapeValidationPipe({
        treatment: { values: ['GRAVADO', 'EXENTO', 'EXCLUIDO', 'NO_APLICA'], optional: true },
        ratePct: 'decimal?',
        effectiveFrom: 'date?',
        effectiveTo: 'date?',
        documentReference: 'text?',
      }),
    )
    body: UpdateProductTaxProfileInput,
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
    @Param('id', ParseUUIDPipe) id: string,
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
