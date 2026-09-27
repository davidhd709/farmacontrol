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
} from '@nestjs/common';
import type { Request } from 'express';
import {
  SYSTEM_PERMISSIONS,
  CashMovementDto,
  CashBalanceDto,
  PaginatedResponse,
} from '@farmacia/contracts';
import { CashService } from '../../application/cash.service';
import {
  CreateCashMovementDto,
  CreateCashMovementValidationPipe,
} from '../dtos/create-cash-movement.dto';
import {
  CashMovementQueryDto,
  CashMovementQueryValidationPipe,
} from '../dtos/cash-query.dto';
import {
  SessionAuthGuard,
  AuthenticatedUserContext,
} from '../../../identity/presentation/guards/session-auth.guard';
import { PermissionsGuard } from '../../../identity/presentation/guards/permissions.guard';
import { RequirePermissions } from '../../../identity/presentation/decorators/require-permissions.decorator';
import { CurrentUser } from '../../../identity/presentation/decorators/current-user.decorator';

@Controller('cash-movements')
@UseGuards(SessionAuthGuard, PermissionsGuard)
export class CashController {
  constructor(private readonly cashService: CashService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @RequirePermissions(SYSTEM_PERMISSIONS.CASH_MOVEMENTS)
  public async create(
    @Body(CreateCashMovementValidationPipe) dto: CreateCashMovementDto,
    @CurrentUser() user: AuthenticatedUserContext,
    @Req() req: Request
  ): Promise<CashMovementDto> {
    return this.cashService.registerMovement(dto, {
      userId: user.id,
      ipAddress: req.ip,
      correlationId: req.headers['x-correlation-id'] as string | undefined,
    });
  }

  @Get('balance')
  @RequirePermissions(SYSTEM_PERMISSIONS.CASH_READ)
  public async getBalance(): Promise<CashBalanceDto> {
    return this.cashService.getBalance();
  }

  @Get()
  @RequirePermissions(SYSTEM_PERMISSIONS.CASH_READ)
  public async list(
    @Query(CashMovementQueryValidationPipe) query: CashMovementQueryDto
  ): Promise<PaginatedResponse<CashMovementDto>> {
    return this.cashService.listMovements(query);
  }

  @Get(':id')
  @RequirePermissions(SYSTEM_PERMISSIONS.CASH_READ)
  public async getById(@Param('id') id: string): Promise<CashMovementDto> {
    return this.cashService.getMovementById(id);
  }
}
