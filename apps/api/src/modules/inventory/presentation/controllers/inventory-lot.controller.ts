import { QueryFieldValidationPipe } from '../../../../common/pagination/request-shape.pipe';
import { parsePaginationValue } from '../../../../common/pagination/pagination';
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
    @Query('productId', new QueryFieldValidationPipe('productId', 'uuid?')) productId?: string,
    @Query('locationId', new QueryFieldValidationPipe('locationId', 'uuid?')) locationId?: string,
    @Query('lotNumber', new QueryFieldValidationPipe('lotNumber', 'text?')) lotNumber?: string,
    @Query('hasStockOnly', new QueryFieldValidationPipe('hasStockOnly', 'booleanString?'))
    hasStockOnly?: string,
    @Query('expiringBefore', new QueryFieldValidationPipe('expiringBefore', 'date?'))
    expiringBefore?: string,
    @Query('isActive', new QueryFieldValidationPipe('isActive', 'booleanString?'))
    isActive?: string,
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
      page: parsePaginationValue(page, 'page'),
      pageSize: parsePaginationValue(pageSize, 'pageSize'),
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
    @Query('locationId', new QueryFieldValidationPipe('locationId', 'uuid?')) locationId?: string,
  ) {
    const data = await this.inventoryLotService.getAvailableLotsFefo(productId, locationId);
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

    const data = await this.inventoryLotService.createLot(dto, user.id, ipAddress, correlationId);
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
