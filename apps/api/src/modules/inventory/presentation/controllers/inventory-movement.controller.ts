import {
  Controller,
  Get,
  Post,
  Body,
  Query,
  UseGuards,
  Req,
  HttpCode,
  HttpStatus,
  BadRequestException,
} from '@nestjs/common';
import type { Request } from 'express';
import { SessionAuthGuard } from '../../../identity/presentation/guards/session-auth.guard';
import { PermissionsGuard } from '../../../identity/presentation/guards/permissions.guard';
import { RequirePermissions } from '../../../identity/presentation/decorators/require-permissions.decorator';
import { CurrentUser } from '../../../identity/presentation/decorators/current-user.decorator';
import type { AuthenticatedUserContext } from '../../../identity/presentation/guards/session-auth.guard';
import { SYSTEM_PERMISSIONS, InventoryMovementType } from '@farmacia/contracts';
import { InventoryMovementService } from '../../application/services/inventory-movement.service';

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

@Controller('inventory/movements')
@UseGuards(SessionAuthGuard, PermissionsGuard)
export class InventoryMovementController {
  constructor(
    private readonly movementService: InventoryMovementService,
  ) {}

  @Get()
  @RequirePermissions(SYSTEM_PERMISSIONS.INVENTORY_MOVEMENTS_READ)
  public async getMovements(
    @Query('productId') productId?: string,
    @Query('lotId') lotId?: string,
    @Query('movementType') movementType?: string,
    @Query('fromDate') fromDate?: string,
    @Query('toDate') toDate?: string,
    @Query('referenceDocumentId') referenceDocumentId?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    const result = await this.movementService.getMovements({
      productId,
      lotId,
      movementType: movementType as InventoryMovementType,
      fromDate,
      toDate,
      referenceDocumentId,
      page: page ? parseInt(page, 10) : undefined,
      pageSize: pageSize ? parseInt(pageSize, 10) : undefined,
    });
    return { success: true, ...result };
  }

  @Post('adjust')
  @RequirePermissions(SYSTEM_PERMISSIONS.INVENTORY_ADJUST)
  @HttpCode(HttpStatus.CREATED)
  public async adjustInventory(
    @Body() body: any,
    @CurrentUser() user: AuthenticatedUserContext,
    @Req() req: Request,
  ) {
    if (!body || typeof body !== 'object') {
      throw new BadRequestException('El cuerpo de la solicitud no es válido.');
    }
    if (!body.productId || !UUID_REGEX.test(body.productId)) {
      throw new BadRequestException('productId inválido.');
    }
    if (!body.lotId || !UUID_REGEX.test(body.lotId)) {
      throw new BadRequestException('lotId inválido.');
    }
    if (body.adjustmentType !== 'INCREMENTO' && body.adjustmentType !== 'DECREMENTO') {
      throw new BadRequestException('adjustmentType debe ser INCREMENTO o DECREMENTO.');
    }
    if (
      typeof body.quantityBaseUnits !== 'number' ||
      !Number.isInteger(body.quantityBaseUnits) ||
      body.quantityBaseUnits <= 0
    ) {
      throw new BadRequestException('quantityBaseUnits debe ser un entero positivo mayor a 0.');
    }
    if (!body.reason || typeof body.reason !== 'string' || body.reason.trim().length === 0) {
      throw new BadRequestException('reason (motivo justificado) es obligatorio.');
    }

    const ipAddress = req.ip || req.socket.remoteAddress;
    const correlationId = req.headers['x-correlation-id'] as string;

    const data = await this.movementService.adjustInventory(
      {
        productId: body.productId,
        lotId: body.lotId,
        adjustmentType: body.adjustmentType,
        quantityBaseUnits: body.quantityBaseUnits,
        reason: body.reason.trim(),
        notes: body.notes,
      },
      user.id,
      ipAddress,
      correlationId,
    );

    return { success: true, data };
  }
}
