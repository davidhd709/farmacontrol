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
} from '@nestjs/common';
import type { Request } from 'express';
import {
  SYSTEM_PERMISSIONS,
  SaleDto,
  SaleQueryFilters,
  PaginatedResponse,
} from '@farmacia/contracts';
import { SaleService } from '../../application/sale.service';
import {
  ConfirmSaleDto,
  ConfirmSaleValidationPipe,
} from '../dtos/confirm-sale.dto';
import {
  CancelSaleDto,
  CancelSaleValidationPipe,
} from '../dtos/cancel-sale.dto';
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
  SaleHasActivePaymentsException,
  IdempotencyConflictException,
} from '../../domain/sale.exceptions';

@Controller('sales')
@UseGuards(SessionAuthGuard, PermissionsGuard)
export class SaleController {
  constructor(private readonly saleService: SaleService) {}

  @Post('confirm')
  @HttpCode(HttpStatus.CREATED)
  @RequirePermissions(SYSTEM_PERMISSIONS.SALES_CREATE)
  public async confirmSale(
    @Body(ConfirmSaleValidationPipe) dto: ConfirmSaleDto,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @CurrentUser() user: AuthenticatedUserContext,
    @Req() req: Request
  ): Promise<SaleDto> {
    try {
      return await this.saleService.confirmSale(
        dto,
        {
          userId: user.id,
          ipAddress: req.ip,
          correlationId: req.headers['x-correlation-id'] as string | undefined,
        },
        idempotencyKey
      );
    } catch (error) {
      if (error instanceof InsufficientStockException) {
        throw new BadRequestException(error.message);
      }
      if (error instanceof IdempotencyConflictException) {
        throw new ConflictException(error.message);
      }
      if (error instanceof Error) {
        throw new BadRequestException(error.message);
      }
      throw error;
    }
  }

  @Get()
  @RequirePermissions(SYSTEM_PERMISSIONS.SALES_READ)
  public async findAll(
    @Query(SaleQueryValidationPipe) query: SaleQueryFilters
  ): Promise<PaginatedResponse<SaleDto>> {
    return this.saleService.getSales(query);
  }

  @Get(':id')
  @RequirePermissions(SYSTEM_PERMISSIONS.SALES_READ)
  public async findOne(@Param('id') id: string): Promise<SaleDto> {
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
    @Param('id') id: string,
    @Body(CancelSaleValidationPipe) dto: CancelSaleDto,
    @CurrentUser() user: AuthenticatedUserContext,
    @Req() req: Request
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
        error instanceof SaleHasActivePaymentsException
      ) {
        throw new ConflictException(error.message);
      }
      if (error instanceof Error) {
        throw new BadRequestException(error.message);
      }
      throw error;
    }
  }
}
