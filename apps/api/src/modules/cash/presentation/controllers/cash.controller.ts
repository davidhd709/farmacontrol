import { QueryShapeValidationPipe } from '../../../../common/pagination/request-shape.pipe';
import {
  Controller,
  Get,
  Post,
  Param,
  Query,
  UseGuards,
  ParseUUIDPipe,
} from '@nestjs/common';
import {
  SYSTEM_PERMISSIONS,
  CashMovementDto,
  CashBalanceDto,
  PaginatedResponse,
} from '@farmacia/contracts';
import { ApiResponse } from '@nestjs/swagger';
import { CashService } from '../../application/cash.service';
import { retiredRoute, VOUCHER_REPLACEMENT } from '../../../../common/http/retired-route';
import { CashMovementQueryDto, CashMovementQueryValidationPipe } from '../dtos/cash-query.dto';
import {
  SessionAuthGuard,
} from '../../../identity/presentation/guards/session-auth.guard';
import { PermissionsGuard } from '../../../identity/presentation/guards/permissions.guard';
import { RequirePermissions } from '../../../identity/presentation/decorators/require-permissions.decorator';

@Controller('cash-movements')
@UseGuards(SessionAuthGuard, PermissionsGuard)
export class CashController {
  constructor(private readonly cashService: CashService) {}

  /** Retirada: el efectivo entra y sale con recibos de caja y comprobantes de egreso. */
  @Post()
  @ApiResponse({ status: 410, description: 'Ruta retirada: use recibos de caja o comprobantes de egreso.' })
  @RequirePermissions(SYSTEM_PERMISSIONS.CASH_MOVEMENTS)
  public create(): never {
    return retiredRoute('POST /api/v1/cash-movements', VOUCHER_REPLACEMENT);
  }

  @Get('balance')
  @RequirePermissions(SYSTEM_PERMISSIONS.CASH_READ)
  public async getBalance(): Promise<CashBalanceDto> {
    return this.cashService.getBalance();
  }

  @Get()
  @RequirePermissions(SYSTEM_PERMISSIONS.CASH_READ)
  public async list(
    @Query(
      new QueryShapeValidationPipe({
        movementType: 'text?',
        paymentMethod: 'text?',
        startDate: 'date?',
        endDate: 'date?',
        sortOrder: 'text?',
      }),
      CashMovementQueryValidationPipe,
    )
    query: CashMovementQueryDto,
  ): Promise<PaginatedResponse<CashMovementDto>> {
    return this.cashService.listMovements(query);
  }

  @Get(':id')
  @RequirePermissions(SYSTEM_PERMISSIONS.CASH_READ)
  public async getById(@Param('id', ParseUUIDPipe) id: string): Promise<CashMovementDto> {
    return this.cashService.getMovementById(id);
  }
}
