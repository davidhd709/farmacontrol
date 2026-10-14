import { QueryFieldValidationPipe } from '../../../../common/pagination/request-shape.pipe';
import { parsePaginationValue } from '../../../../common/pagination/pagination';
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
import { CurrentUser } from '../../../identity/presentation/decorators/current-user.decorator';
import type { AuthenticatedUserContext } from '../../../identity/presentation/guards/session-auth.guard';
import { RequirePermissions } from '../../../identity/presentation/decorators/require-permissions.decorator';
import {
  SYSTEM_PERMISSIONS,
  InventoryMovementType,
  INVENTORY_ADJUSTMENT_REASON_MAX_LENGTH,
  INVENTORY_MOVEMENT_NOTES_MAX_LENGTH,
} from '@farmacia/contracts';
import { InventoryMovementService } from '../../application/services/inventory-movement.service';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

@Controller('inventory/movements')
@UseGuards(SessionAuthGuard, PermissionsGuard)
export class InventoryMovementController {
  constructor(private readonly movementService: InventoryMovementService) {}

  @Get()
  @RequirePermissions(SYSTEM_PERMISSIONS.INVENTORY_MOVEMENTS_READ)
  public async getMovements(
    @Query('productId', new QueryFieldValidationPipe('productId', 'uuid?')) productId?: string,
    @Query('lotId', new QueryFieldValidationPipe('lotId', 'uuid?')) lotId?: string,
    @Query('movementType', new QueryFieldValidationPipe('movementType', 'text?'))
    movementType?: string,
    @Query('fromDate', new QueryFieldValidationPipe('fromDate', 'date?')) fromDate?: string,
    @Query('toDate', new QueryFieldValidationPipe('toDate', 'date?')) toDate?: string,
    @Query('referenceDocumentId', new QueryFieldValidationPipe('referenceDocumentId', 'text?'))
    referenceDocumentId?: string,
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
      page: parsePaginationValue(page, 'page'),
      pageSize: parsePaginationValue(pageSize, 'pageSize'),
    });
    return { success: true, ...result };
  }

  @Post('adjust')
  @RequirePermissions(SYSTEM_PERMISSIONS.INVENTORY_ADJUST)
  @HttpCode(HttpStatus.CREATED)
  public async adjustInventory(
    @Body() body: any,
    @Req() req: Request,
    @CurrentUser() user: AuthenticatedUserContext,
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
    if (!Number.isSafeInteger(body.quantityBaseUnits) || body.quantityBaseUnits <= 0) {
      throw new BadRequestException('quantityBaseUnits debe ser un entero positivo mayor a 0.');
    }
    if (!body.reason || typeof body.reason !== 'string' || body.reason.trim().length === 0) {
      throw new BadRequestException('reason (motivo justificado) es obligatorio.');
    }
    // FARM-AUD-012: límites de las columnas reason y notes; superarlos era un error 500
    if (body.reason.trim().length > INVENTORY_ADJUSTMENT_REASON_MAX_LENGTH) {
      throw new BadRequestException(
        `El motivo del ajuste no puede superar ${INVENTORY_ADJUSTMENT_REASON_MAX_LENGTH} caracteres.`,
      );
    }

    if (body.notes !== undefined && body.notes !== null && typeof body.notes !== 'string') {
      throw new BadRequestException('notes debe ser texto.');
    }
    const notes = typeof body.notes === 'string' ? body.notes.trim() : '';
    if (notes.length > INVENTORY_MOVEMENT_NOTES_MAX_LENGTH) {
      throw new BadRequestException(
        `Las observaciones no pueden superar ${INVENTORY_MOVEMENT_NOTES_MAX_LENGTH} caracteres.`,
      );
    }

    const ipAddress = req.ip || req.socket.remoteAddress;
    // Identificador ya validado por CorrelationIdMiddleware; la cabecera cruda puede ser inválida
    const correlationId = req.correlationId;

    const data = await this.movementService.adjustInventory(
      {
        productId: body.productId,
        lotId: body.lotId,
        adjustmentType: body.adjustmentType,
        quantityBaseUnits: body.quantityBaseUnits,
        reason: body.reason.trim(),
        notes: notes || undefined,
      },
      user.id,
      ipAddress,
      correlationId,
    );

    return { success: true, data };
  }
}
