import { BadRequestException, Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiOperation } from '@nestjs/swagger';
import { SYSTEM_PERMISSIONS, type TaxCatalogDto } from '@farmacia/contracts';
import { SessionAuthGuard } from '../../identity/presentation/guards/session-auth.guard';
import { PermissionsGuard } from '../../identity/presentation/guards/permissions.guard';
import { RequirePermissions } from '../../identity/presentation/decorators/require-permissions.decorator';
import { businessToday } from '../../../common/utils/business-date';
import { taxCatalogAt } from '../application/tax-catalog.reader';

/** Catálogo normativo colombiano vigente: solo lectura (ADR-006, F6). */
@Controller('tax-catalog')
@UseGuards(SessionAuthGuard, PermissionsGuard)
export class TaxCatalogController {
  @Get()
  @RequirePermissions(SYSTEM_PERMISSIONS.PRODUCTS_READ)
  @ApiOperation({ summary: 'Reglas tributarias y UVT vigentes en un día (por defecto, hoy)' })
  getCatalog(@Query('day') day?: string): Promise<TaxCatalogDto> {
    if (day !== undefined && !/^\d{4}-\d{2}-\d{2}$/.test(day)) {
      throw new BadRequestException('day debe tener formato YYYY-MM-DD.');
    }
    return taxCatalogAt(day ?? businessToday());
  }
}
