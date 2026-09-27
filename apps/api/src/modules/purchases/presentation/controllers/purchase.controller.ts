import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  Req,
  UseGuards,
  HttpCode,
  HttpStatus,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import type { Request } from 'express';
import {
  SYSTEM_PERMISSIONS,
  PurchaseDto,
  PaginatedResponse,
} from '@farmacia/contracts';
import { PurchaseService } from '../../application/purchase.service';
import {
  ReceivePurchaseDto,
  ReceivePurchaseValidationPipe,
} from '../dtos/receive-purchase.dto';
import { PurchaseQueryValidationPipe } from '../dtos/purchase-query.dto';
import {
  SessionAuthGuard,
  AuthenticatedUserContext,
} from '../../../identity/presentation/guards/session-auth.guard';
import { PermissionsGuard } from '../../../identity/presentation/guards/permissions.guard';
import { RequirePermissions } from '../../../identity/presentation/decorators/require-permissions.decorator';
import { CurrentUser } from '../../../identity/presentation/decorators/current-user.decorator';
import {
  PurchaseNotFoundException,
  SupplierNotActiveException,
  ExpiredLotDateException,
} from '../../domain/purchase.exceptions';

@Controller('purchases')
@UseGuards(SessionAuthGuard, PermissionsGuard)
export class PurchaseController {
  constructor(private readonly purchaseService: PurchaseService) {}

  @Post('receive')
  @HttpCode(HttpStatus.CREATED)
  @RequirePermissions(SYSTEM_PERMISSIONS.PURCHASES_RECEIVE)
  public async receive(
    @Body(ReceivePurchaseValidationPipe) dto: ReceivePurchaseDto,
    @CurrentUser() user: AuthenticatedUserContext,
    @Req() req: Request
  ): Promise<PurchaseDto> {
    try {
      const purchase = await this.purchaseService.receivePurchase(dto, {
        userId: user.id,
        ipAddress: req.ip,
        correlationId: req.headers['x-correlation-id'] as string | undefined,
      });
      return purchase.toDto();
    } catch (error) {
      if (
        error instanceof SupplierNotActiveException ||
        error instanceof ExpiredLotDateException
      ) {
        throw new BadRequestException(error.message);
      }
      if (error instanceof Error) {
        throw new BadRequestException(error.message);
      }
      throw error;
    }
  }

  @Get()
  @RequirePermissions(SYSTEM_PERMISSIONS.PURCHASES_READ)
  public async findAll(
    @Query(PurchaseQueryValidationPipe) query: any
  ): Promise<PaginatedResponse<PurchaseDto>> {
    return this.purchaseService.getPurchases(query);
  }

  @Get(':id')
  @RequirePermissions(SYSTEM_PERMISSIONS.PURCHASES_READ)
  public async findOne(@Param('id') id: string): Promise<PurchaseDto> {
    try {
      const purchase = await this.purchaseService.getPurchaseById(id);
      return purchase.toDto();
    } catch (error) {
      if (error instanceof PurchaseNotFoundException) {
        throw new NotFoundException(error.message);
      }
      throw error;
    }
  }
}
