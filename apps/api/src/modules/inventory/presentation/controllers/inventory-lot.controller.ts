import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  UseGuards,
  Req,
  HttpCode,
  HttpStatus,
  ParseUUIDPipe,
} from '@nestjs/common';
import type { Request } from 'express';
import { SessionAuthGuard } from '../../../identity/presentation/guards/session-auth.guard';
import { PermissionsGuard } from '../../../identity/presentation/guards/permissions.guard';
import { CurrentUser } from '../../../identity/presentation/decorators/current-user.decorator';
import type { AuthenticatedUserContext } from '../../../identity/presentation/guards/session-auth.guard';
import { RequirePermissions } from '../../../identity/presentation/decorators/require-permissions.decorator';
import { SYSTEM_PERMISSIONS } from '@farmacia/contracts';
import { InventoryLotService } from '../../application/services/inventory-lot.service';
import {
  CreateInventoryLotDto,
  CreateLocationDto,
  CreateInventoryLotValidationPipe,
  CreateLocationValidationPipe,
} from '../dto/inventory-lot.dto';

@Controller('inventory')
@UseGuards(SessionAuthGuard, PermissionsGuard)
export class InventoryLotController {
  constructor(private readonly inventoryLotService: InventoryLotService) {}

  @Get('lots')
  @RequirePermissions(SYSTEM_PERMISSIONS.INVENTORY_READ)
  public async getLots(
    @Query('productId') productId?: string,
    @Query('locationId') locationId?: string,
    @Query('lotNumber') lotNumber?: string,
    @Query('hasStockOnly') hasStockOnly?: string,
    @Query('expiringBefore') expiringBefore?: string,
    @Query('isActive') isActive?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    const result = await this.inventoryLotService.getLots({
      productId,
      locationId,
      lotNumber,
      hasStockOnly: hasStockOnly === 'true',
      expiringBefore,
      isActive: isActive !== undefined ? isActive === 'true' : undefined,
      page: page ? parseInt(page, 10) : undefined,
      pageSize: pageSize ? parseInt(pageSize, 10) : undefined,
    });
    return { success: true, ...result };
  }

  @Get('lots/:id')
  @RequirePermissions(SYSTEM_PERMISSIONS.INVENTORY_READ)
  public async getLotById(@Param('id', ParseUUIDPipe) id: string) {
    const data = await this.inventoryLotService.getLotById(id);
    return { success: true, data };
  }

  @Get('products/:productId/fefo')
  @RequirePermissions(SYSTEM_PERMISSIONS.INVENTORY_READ)
  public async getLotsByProductFefo(
    @Param('productId', ParseUUIDPipe) productId: string,
    @Query('locationId') locationId?: string,
  ) {
    const data = await this.inventoryLotService.getAvailableLotsFefo(
      productId,
      locationId,
    );
    return { success: true, data };
  }

  @Post('products/:productId/allocate-fefo')
  @RequirePermissions(SYSTEM_PERMISSIONS.SALES_CREATE)
  @HttpCode(HttpStatus.OK)
  public async allocateFefo(
    @Param('productId', ParseUUIDPipe) productId: string,
    @Body() body: { quantityBaseUnits: number; notes?: string; referenceDocumentId?: string },
    @Req() req: Request,
    @CurrentUser() user: AuthenticatedUserContext,
  ) {
    const data = await this.inventoryLotService.allocateFefoStock(
      productId,
      body.quantityBaseUnits,
      'VENTA',
      body.referenceDocumentId,
      user.id,
      body.notes,
    );
    return { success: true, data };
  }

  @Post('lots')
  @RequirePermissions(SYSTEM_PERMISSIONS.INVENTORY_LOTS_MANAGE)
  @HttpCode(HttpStatus.CREATED)
  public async createLot(
    @Body(CreateInventoryLotValidationPipe) dto: CreateInventoryLotDto,
    @Req() req: Request,
    @CurrentUser() user: AuthenticatedUserContext,
  ) {
    const ipAddress = req.ip || req.socket.remoteAddress;
    const correlationId = req.headers['x-correlation-id'] as string;

    const data = await this.inventoryLotService.createLot(
      dto,
      user.id,
      ipAddress,
      correlationId,
    );
    return { success: true, data };
  }

  @Get('locations')
  @RequirePermissions(SYSTEM_PERMISSIONS.INVENTORY_READ)
  public async getLocations() {
    const data = await this.inventoryLotService.getLocations();
    return { success: true, data };
  }

  @Post('locations')
  @RequirePermissions(SYSTEM_PERMISSIONS.INVENTORY_LOTS_MANAGE)
  @HttpCode(HttpStatus.CREATED)
  public async createLocation(
    @Body(CreateLocationValidationPipe) dto: CreateLocationDto,
    @Req() req: Request,
    @CurrentUser() user: AuthenticatedUserContext,
  ) {
    const ipAddress = req.ip || req.socket.remoteAddress;
    const correlationId = req.headers['x-correlation-id'] as string;

    const data = await this.inventoryLotService.createLocation(
      dto,
      user.id,
      ipAddress,
      correlationId,
    );
    return { success: true, data };
  }
}
