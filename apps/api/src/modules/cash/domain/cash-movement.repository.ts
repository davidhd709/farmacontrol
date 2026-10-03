import { CashMovement } from './cash-movement.entity';
import {
  CashMovementType,
  PaymentMethod,
  CashMovementQueryFilters,
  CashBalanceDto,
} from '@farmacia/contracts';

export interface CreateCashMovementData {
  movementType: CashMovementType;
  amount: number | string;
  paymentMethod: PaymentMethod;
  reason: string;
  referenceDocumentType?: string | null;
  referenceDocumentId?: string | null;
  createdByUserId: string;
}

export const CASH_MOVEMENT_REPOSITORY = Symbol('CASH_MOVEMENT_REPOSITORY');

export interface ICashMovementRepository {
  saveTransactional(data: CreateCashMovementData, tx?: any): Promise<CashMovement>;
  getCurrentBalance(paymentMethod?: PaymentMethod): Promise<CashBalanceDto>;
  findAll(filters: CashMovementQueryFilters): Promise<{ items: CashMovement[]; total: number }>;
  findById(id: string): Promise<CashMovement | null>;
}
