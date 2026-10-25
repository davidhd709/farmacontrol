import { prisma, Prisma } from '@farmacia/database';
import {
  Inject,
  Injectable,
  Optional,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import {
  CashMovementDto,
  CashBalanceDto,
  CreateCashMovementPayload,
  CashMovementQueryFilters,
  PaginatedResponse,
} from '@farmacia/contracts';
import {
  ICashMovementRepository,
  CASH_MOVEMENT_REPOSITORY,
} from '../domain/cash-movement.repository';
import { CashMovement } from '../domain/cash-movement.entity';
import {
  InvalidCashAmountException,
  InvalidCashMovementTypeException,
  InvalidCashPaymentMethodException,
  InsufficientCashBalanceException,
  CashMovementNotFoundException,
} from '../domain/cash.exceptions';
import { AuditService } from '../../audit/application/services/audit.service';
import { serializableTransaction } from '../../../common/utils/serializable-transaction';
import { AccountingEngineService } from '../../accounting/application/accounting-engine.service';

export interface AuditContext {
  userId?: string | null;
  ipAddress?: string | null;
  correlationId?: string | null;
}

@Injectable()
export class CashService {
  constructor(
    @Inject(CASH_MOVEMENT_REPOSITORY)
    private readonly cashRepository: ICashMovementRepository,
    @Optional()
    private readonly auditService?: AuditService,
    @Optional()
    private readonly accountingEngine?: AccountingEngineService,
  ) {}

  async registerMovement(
    payload: CreateCashMovementPayload,
    auditCtx: AuditContext = {},
  ): Promise<CashMovementDto> {
    const userId = auditCtx.userId;
    if (!userId) {
      throw new BadRequestException('El usuario que registra el movimiento es requerido');
    }

    const paymentMethod = payload.paymentMethod === undefined ? 'EFECTIVO' : payload.paymentMethod;
    if (paymentMethod !== 'EFECTIVO') {
      throw new BadRequestException(new InvalidCashPaymentMethodException().message);
    }

    try {
      const persist = async (tx?: Prisma.TransactionClient) => {
        const savedMovement = await this.cashRepository.saveTransactional(
          {
            movementType: payload.movementType,
            amount: payload.amount,
            paymentMethod,
            reason: payload.reason,
            referenceDocumentType: payload.referenceDocumentType,
            referenceDocumentId: payload.referenceDocumentId,
            createdByUserId: userId,
          },
          tx,
        );

        // Auditoría
        if (this.auditService) {
          await this.auditService.recordEvent(
            {
              action: 'cash:movement_created',
              entity: 'CashMovement',
              entityId: savedMovement.id,
              userId,
              ipAddress: auditCtx.ipAddress || null,
              correlationId: auditCtx.correlationId || null,
              details: {
                movementType: savedMovement.movementType,
                amount: savedMovement.amount,
                paymentMethod: savedMovement.paymentMethod,
                reason: savedMovement.reason,
                balanceAfter: savedMovement.balanceAfter,
                referenceDocumentType: savedMovement.referenceDocumentType,
                referenceDocumentId: savedMovement.referenceDocumentId,
              },
            },
            tx,
          );
        }

        // F8: el movimiento manual se contabiliza contra la contrapartida que eligió el usuario
        if (this.accountingEngine) {
          if (!payload.counterpartAccountId) {
            throw new BadRequestException(
              'El movimiento manual de caja requiere la cuenta de contrapartida del asiento.',
            );
          }
          await this.accountingEngine.handleManualTreasuryMovement(
            {
              sourceType: 'CASH_MOVEMENT',
              sourceId: savedMovement.id,
              direction: savedMovement.movementType.startsWith('INGRESO') ? 'IN' : 'OUT',
              amount: Number(savedMovement.amount).toFixed(2),
              counterpartAccountId: payload.counterpartAccountId,
              description: `Movimiento de caja: ${savedMovement.reason}`,
              createdById: userId,
            },
            tx!,
          );
        }

        return this.toDto(savedMovement);
      };
      if (this.accountingEngine) return serializableTransaction(persist);
      return this.auditService ? prisma.$transaction(persist) : persist();
    } catch (err: any) {
      if (
        err instanceof InvalidCashAmountException ||
        err instanceof InvalidCashMovementTypeException ||
        err instanceof InsufficientCashBalanceException
      ) {
        throw new BadRequestException(err.message);
      }
      throw err;
    }
  }

  async getBalance(): Promise<CashBalanceDto> {
    return this.cashRepository.getCurrentBalance();
  }

  async listMovements(
    filters: CashMovementQueryFilters,
  ): Promise<PaginatedResponse<CashMovementDto>> {
    const page = Math.max(Number(filters.page) || 1, 1);
    const limit = Math.max(Number(filters.limit) || 20, 1);

    const { items, total } = await this.cashRepository.findAll(filters);

    return {
      items: items.map((item) => this.toDto(item)),
      total,
      page,
      pageSize: limit,
      totalPages: Math.ceil(total / limit) || 1,
    };
  }

  async getMovementById(id: string): Promise<CashMovementDto> {
    const movement = await this.cashRepository.findById(id);
    if (!movement) {
      throw new NotFoundException(`Movimiento de caja con ID "${id}" no encontrado`);
    }
    return this.toDto(movement);
  }

  /**
   * Registra un movimiento de caja dentro de una transacción Prisma existente.
   * Usado por módulos como receivables y payables que necesitan
   * consistencia transaccional con otras operaciones.
   */
  async recordMovementInTransaction(
    tx: any,
    payload: {
      movementType: string;
      amount: number | string;
      paymentMethod?: string;
      reason: string;
      referenceDocumentType?: string;
      referenceDocumentId?: string;
      createdByUserId: string;
    },
  ): Promise<void> {
    const paymentMethod = payload.paymentMethod === undefined ? 'EFECTIVO' : payload.paymentMethod;
    if (paymentMethod !== 'EFECTIVO') {
      throw new BadRequestException(new InvalidCashPaymentMethodException().message);
    }
    await this.cashRepository.saveTransactional(
      {
        movementType: payload.movementType as any,
        amount: payload.amount,
        paymentMethod,
        reason: payload.reason,
        referenceDocumentType: payload.referenceDocumentType,
        referenceDocumentId: payload.referenceDocumentId,
        createdByUserId: payload.createdByUserId,
      },
      tx,
    );
  }

  private toDto(entity: CashMovement): CashMovementDto {
    return {
      id: entity.id,
      movementType: entity.movementType,
      amount: entity.amount,
      paymentMethod: entity.paymentMethod,
      reason: entity.reason,
      referenceDocumentType: entity.referenceDocumentType,
      referenceDocumentId: entity.referenceDocumentId,
      balanceAfter: entity.balanceAfter,
      createdAt: entity.createdAt.toISOString(),
      createdByUserId: entity.createdByUserId,
      createdByUsername: entity.createdByUsername,
    };
  }
}
