import { QueryShapeValidationPipe } from '../../../../common/pagination/request-shape.pipe';
import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  Headers,
  Req,
  UseGuards,
  HttpCode,
  HttpStatus,
  NotFoundException,
  ConflictException,
  BadRequestException,
  ParseUUIDPipe,
} from '@nestjs/common';
import { ApiBody, ApiOperation, ApiOkResponse, ApiResponse } from '@nestjs/swagger';
import type { Request } from 'express';
import {
  SYSTEM_PERMISSIONS,
  SaleDto,
  FefoPreviewDto,
  SaleQueryFilters,
  PaginatedResponse,
} from '@farmacia/contracts';
import { SaleService } from '../../application/sale.service';
import { ConfirmSaleDto, ConfirmSaleValidationPipe } from '../dtos/confirm-sale.dto';
import { FefoPreviewRequestDto, FefoPreviewValidationPipe } from '../dtos/fefo-preview.dto';
import { CancelSaleDto, CancelSaleValidationPipe } from '../dtos/cancel-sale.dto';
import { SaleQueryValidationPipe } from '../dtos/sale-query.dto';
import {
  SessionAuthGuard,
  AuthenticatedUserContext,
} from '../../../identity/presentation/guards/session-auth.guard';
import { PermissionsGuard } from '../../../identity/presentation/guards/permissions.guard';
import { RequirePermissions } from '../../../identity/presentation/decorators/require-permissions.decorator';
import { CurrentUser } from '../../../identity/presentation/decorators/current-user.decorator';
import {
  SaleNotFoundException,
  InsufficientStockException,
  SaleAlreadyCancelledException,
  SaleHasCreditNotesException,
  SaleHasReceivablePaymentsException,
  IdempotencyConflictException,
} from '../../domain/sale.exceptions';

@Controller('sales')
@UseGuards(SessionAuthGuard, PermissionsGuard)
export class SaleController {
  constructor(private readonly saleService: SaleService) {}

  @Post('fefo-preview')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(SYSTEM_PERMISSIONS.SALES_CREATE)
  @ApiOperation({
    summary: 'Asignación FEFO automática para el carrito actual',
    description:
      'Consulta de sólo lectura; no reserva existencias. La confirmación recalcula con bloqueo.',
  })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['items'],
      properties: {
        items: {
          type: 'array',
          minItems: 1,
          maxItems: 100,
          items: {
            type: 'object',
            required: ['productId', 'quantityCommercial'],
            properties: {
              productId: { type: 'string', format: 'uuid' },
              presentationId: { type: 'string', format: 'uuid', nullable: true },
              quantityCommercial: { type: 'number', minimum: 0, exclusiveMinimum: true },
            },
          },
        },
      },
    },
  })
  @ApiOkResponse({
    description:
      'Asignaciones parciales, existencias disponibles y faltantes por línea, en orden de carrito.',
    schema: {
      type: 'object',
      required: ['businessDay', 'lines'],
      properties: {
        businessDay: { type: 'string', format: 'date', description: 'Día de negocio en Bogotá' },
        lines: {
          type: 'array',
          items: {
            type: 'object',
            required: [
              'productId',
              'presentationId',
              'requiredBaseUnits',
              'availableBaseUnits',
              'shortfallBaseUnits',
              'allocations',
            ],
            properties: {
              productId: { type: 'string', format: 'uuid' },
              presentationId: { type: 'string', format: 'uuid', nullable: true },
              requiredBaseUnits: { type: 'integer' },
              availableBaseUnits: {
                type: 'integer',
                description: 'Saldo previo a esta línea, tras consumir las anteriores',
              },
              shortfallBaseUnits: { type: 'integer' },
              allocations: {
                type: 'array',
                items: {
                  type: 'object',
                  required: ['lotId', 'lotNumber', 'expirationDate', 'quantityBaseUnits'],
                  properties: {
                    lotId: { type: 'string', format: 'uuid' },
                    lotNumber: { type: 'string' },
                    expirationDate: { type: 'string', format: 'date' },
                    quantityBaseUnits: { type: 'integer' },
                  },
                },
              },
            },
          },
        },
      },
    },
  })
  @ApiResponse({ status: 400, description: 'Cuerpo, producto, presentación o cantidad inválidos.' })
  @ApiResponse({ status: 401, description: 'Sesión requerida.' })
  @ApiResponse({ status: 403, description: 'Requiere sales:create.' })
  @ApiResponse({ status: 409, description: 'Producto sin control de lote.' })
  public async previewFefo(
    @Body(FefoPreviewValidationPipe) dto: FefoPreviewRequestDto,
  ): Promise<FefoPreviewDto> {
    return this.saleService.previewFefo(dto);
  }

  @Post('confirm')
  @ApiResponse({ status: 400, description: 'Datos inválidos o existencias insuficientes.' })
  @ApiResponse({ status: 404, description: 'Cliente solicitado no encontrado.' })
  @ApiResponse({ status: 409, description: 'Conflicto de estado o de idempotencia.' })
  @ApiResponse({ status: 500, description: 'Fallo interno; la operación se revierte.' })
  @HttpCode(HttpStatus.CREATED)
  @RequirePermissions(SYSTEM_PERMISSIONS.SALES_CREATE)
  public async confirmSale(
    @Body(ConfirmSaleValidationPipe) dto: ConfirmSaleDto,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @CurrentUser() user: AuthenticatedUserContext,
    @Req() req: Request,
  ): Promise<SaleDto> {
    try {
      return await this.saleService.confirmSale(
        dto,
        {
          userId: user.id,
          ipAddress: req.ip,
          correlationId: req.headers['x-correlation-id'] as string | undefined,
          permissions: user.permissions,
        },
        idempotencyKey,
      );
    } catch (error) {
      if (error instanceof InsufficientStockException) {
        throw new BadRequestException(error.message);
      }
      if (error instanceof IdempotencyConflictException) {
        throw new ConflictException(error.message);
      }
      throw error;
    }
  }

  @Get()
  @RequirePermissions(SYSTEM_PERMISSIONS.SALES_READ)
  public async findAll(
    @Query(
      new QueryShapeValidationPipe({
        invoiceNumber: 'text?',
        customerId: 'uuid?',
        fromDate: 'date?',
        toDate: 'date?',
        status: 'text?',
      }),
      SaleQueryValidationPipe,
    )
    query: SaleQueryFilters,
  ): Promise<PaginatedResponse<SaleDto>> {
    return this.saleService.getSales(query);
  }

  @Get(':id')
  @RequirePermissions(SYSTEM_PERMISSIONS.SALES_READ)
  public async findOne(@Param('id', ParseUUIDPipe) id: string): Promise<SaleDto> {
    try {
      return await this.saleService.getSaleById(id);
    } catch (error) {
      if (error instanceof SaleNotFoundException) {
        throw new NotFoundException(error.message);
      }
      throw error;
    }
  }

  @Post(':id/cancel')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(SYSTEM_PERMISSIONS.SALES_CANCEL)
  public async cancel(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(CancelSaleValidationPipe) dto: CancelSaleDto,
    @CurrentUser() user: AuthenticatedUserContext,
    @Req() req: Request,
  ): Promise<SaleDto> {
    try {
      return await this.saleService.cancelSale(id, dto.reason, {
        userId: user.id,
        ipAddress: req.ip,
        correlationId: req.headers['x-correlation-id'] as string | undefined,
      });
    } catch (error) {
      if (error instanceof SaleNotFoundException) {
        throw new NotFoundException(error.message);
      }
      if (error instanceof SaleAlreadyCancelledException) {
        throw new BadRequestException(error.message);
      }
      if (
        error instanceof SaleHasCreditNotesException ||
        error instanceof SaleHasReceivablePaymentsException
      ) {
        throw new ConflictException(error.message);
      }
      throw error;
    }
  }
}
