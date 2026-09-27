export type CashMovementType =
  | 'INGRESO_VENTA'
  | 'INGRESO_MANUAL'
  | 'EGRESO_MANUAL'
  | 'EGRESO_PAGO_PROVEEDOR';

export type PaymentMethod =
  | 'EFECTIVO'
  | 'TRANSFERENCIA'
  | 'TARJETA_DEBITO'
  | 'TARJETA_CREDITO';

export interface CashMovementDto {
  id: string;
  movementType: CashMovementType;
  amount: number;
  paymentMethod: PaymentMethod;
  reason: string;
  referenceDocumentType?: string | null;
  referenceDocumentId?: string | null;
  balanceAfter: number;
  createdAt: string;
  createdByUserId: string;
  createdByUsername?: string;
}

export interface CashBalanceDto {
  currentBalance: number;
  totalIncomeToday: number;
  totalExpenseToday: number;
  movementsCountToday: number;
  lastMovementAt?: string | null;
}

export interface CreateCashMovementPayload {
  movementType: CashMovementType;
  amount: number;
  paymentMethod?: PaymentMethod;
  reason: string;
  referenceDocumentType?: string;
  referenceDocumentId?: string;
}

export interface CashMovementQueryFilters {
  movementType?: CashMovementType;
  paymentMethod?: PaymentMethod;
  startDate?: string;
  endDate?: string;
  page?: number;
  limit?: number;
}
