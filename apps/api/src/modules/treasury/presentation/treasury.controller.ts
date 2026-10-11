import {
  RequestShapeValidationPipe,
  RequestFieldValidationPipe,
  QueryFieldValidationPipe,
} from '../../../common/pagination/request-shape.pipe';
import { parsePaginationValue } from '../../../common/pagination/pagination';
import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Param,
  Post,
  Put,
  Query,
  UseGuards,
  ParseUUIDPipe,
} from '@nestjs/common';
import { SYSTEM_PERMISSIONS } from '@farmacia/contracts';
import type {
  BankAccountDto,
  BankAccountOptionDto,
  BankAccountsSummaryDto,
  BankMovementDto,
  CreateBankAccountDto,
  CreateBankMovementDto,
  UpdateBankAccountDto,
} from '@farmacia/contracts';
import {
  SessionAuthGuard,
  type AuthenticatedUserContext,
} from '../../identity/presentation/guards/session-auth.guard';
import { PermissionsGuard } from '../../identity/presentation/guards/permissions.guard';
import { RequirePermissions } from '../../identity/presentation/decorators/require-permissions.decorator';
import { CurrentUser } from '../../identity/presentation/decorators/current-user.decorator';
import { TreasuryService } from '../application/treasury.service';
import {
  TreasuryConflictError,
  TreasuryNotFoundError,
  TreasuryValidationError,
} from '../domain/treasury-rules';

function toHttpException(error: unknown): never {
  if (error instanceof TreasuryValidationError) {
    throw new BadRequestException(error.message);
  }
  if (error instanceof TreasuryNotFoundError) {
    throw new NotFoundException(error.message);
  }
  if (error instanceof TreasuryConflictError) {
    throw new ConflictException(error.message);
  }
  throw error;
}

@Controller('treasury')
@UseGuards(SessionAuthGuard, PermissionsGuard)
export class TreasuryController {
  constructor(private readonly treasuryService: TreasuryService) {}

  @Get('bank-accounts/options')
  @RequirePermissions(SYSTEM_PERMISSIONS.TREASURY_ACCOUNTS_SELECT)
  async listAccountOptions(): Promise<BankAccountOptionDto[]> {
    return this.treasuryService.listAccountOptions();
  }

  @Get('bank-accounts')
  @RequirePermissions(SYSTEM_PERMISSIONS.TREASURY_READ)
  async listAccounts(
    @Query('includeInactive', new QueryFieldValidationPipe('includeInactive', 'booleanString?'))
    includeInactive?: string,
  ): Promise<BankAccountDto[]> {
    try {
      const showInactive = includeInactive === 'true';
      return await this.treasuryService.listAccounts(showInactive);
    } catch (error) {
      toHttpException(error);
    }
  }

  @Get('bank-accounts/summary')
  @RequirePermissions(SYSTEM_PERMISSIONS.TREASURY_READ)
  async getSummary(): Promise<BankAccountsSummaryDto> {
    try {
      return await this.treasuryService.getSummary();
    } catch (error) {
      toHttpException(error);
    }
  }

  @Get('bank-accounts/:id')
  @RequirePermissions(SYSTEM_PERMISSIONS.TREASURY_READ)
  async getAccount(@Param('id', ParseUUIDPipe) id: string): Promise<BankAccountDto> {
    try {
      return await this.treasuryService.getAccount(id);
    } catch (error) {
      toHttpException(error);
    }
  }

  @Post('bank-accounts')
  @RequirePermissions(SYSTEM_PERMISSIONS.TREASURY_MANAGE)
  @HttpCode(HttpStatus.CREATED)
  async createAccount(
    @Body(
      new RequestShapeValidationPipe({
        bankName: 'text',
        accountType: 'text',
        accountNumber: 'text',
        name: 'text',
        initialBalance: 'decimal?',
        notes: 'text?',
        ledgerAccountId: 'uuid',
      }),
    )
    dto: CreateBankAccountDto,
    @CurrentUser() user: AuthenticatedUserContext,
  ): Promise<BankAccountDto> {
    try {
      return await this.treasuryService.createAccount(dto, user.id);
    } catch (error) {
      toHttpException(error);
    }
  }

  @Put('bank-accounts/:id')
  @RequirePermissions(SYSTEM_PERMISSIONS.TREASURY_MANAGE)
  async updateAccount(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(
      new RequestShapeValidationPipe({
        name: 'text?',
        notes: 'text?',
        isActive: 'boolean?',
        ledgerAccountId: 'uuid?',
      }),
    )
    dto: UpdateBankAccountDto,
    @CurrentUser() user: AuthenticatedUserContext,
  ): Promise<BankAccountDto> {
    try {
      return await this.treasuryService.updateAccount(id, dto, user.id);
    } catch (error) {
      toHttpException(error);
    }
  }

  @Get('bank-accounts/:id/movements')
  @RequirePermissions(SYSTEM_PERMISSIONS.TREASURY_READ)
  async listMovements(
    @Param('id', ParseUUIDPipe) id: string,
    @Query('fromDate', new QueryFieldValidationPipe('fromDate', 'date?')) fromDate?: string,
    @Query('toDate', new QueryFieldValidationPipe('toDate', 'date?')) toDate?: string,
    @Query('movementType', new QueryFieldValidationPipe('movementType', 'text?'))
    movementType?: string,
    @Query('search', new QueryFieldValidationPipe('search', 'text?')) search?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ): Promise<{ items: BankMovementDto[]; total: number }> {
    try {
      return await this.treasuryService.listMovements(id, {
        fromDate,
        toDate,
        movementType,
        search,
        page: parsePaginationValue(page, 'page'),
        limit: parsePaginationValue(limit, 'limit'),
      });
    } catch (error) {
      toHttpException(error);
    }
  }

  @Post('bank-accounts/:id/movements')
  @RequirePermissions(SYSTEM_PERMISSIONS.TREASURY_MANAGE)
  @HttpCode(HttpStatus.CREATED)
  async createMovement(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(
      new RequestShapeValidationPipe({
        movementType: 'text',
        amount: 'decimal',
        concept: 'text',
        externalReference: 'text?',
        referenceDocumentType: 'text?',
        referenceDocumentId: 'text?',
        movementDate: 'date?',
      }),
    )
    dto: CreateBankMovementDto,
    @CurrentUser() user: AuthenticatedUserContext,
  ): Promise<BankMovementDto> {
    try {
      return await this.treasuryService.createMovement(id, dto, user.id);
    } catch (error) {
      toHttpException(error);
    }
  }

  @Post('bank-accounts/:id/movements/:movementId/reverse')
  @RequirePermissions(SYSTEM_PERMISSIONS.TREASURY_MANAGE)
  @HttpCode(HttpStatus.OK)
  async revertMovement(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('movementId', ParseUUIDPipe) movementId: string,
    @Body('reason', new RequestFieldValidationPipe('reason', 'text')) reason: string,
    @CurrentUser() user: AuthenticatedUserContext,
  ): Promise<BankMovementDto> {
    try {
      if (!reason || typeof reason !== 'string' || !reason.trim()) {
        throw new BadRequestException('El motivo de la reversión es obligatorio.');
      }
      return await this.treasuryService.revertMovement(id, movementId, reason.trim(), user.id);
    } catch (error) {
      toHttpException(error);
    }
  }
}
