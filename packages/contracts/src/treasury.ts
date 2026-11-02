export const BANK_ACCOUNT_TYPES = ['AHORROS', 'CORRIENTE', 'DIGITAL'] as const;
export type BankAccountType = (typeof BANK_ACCOUNT_TYPES)[number];

export const BANK_MOVEMENT_TYPES = [
  'DEPOSIT',
  'WITHDRAWAL',
  'TRANSFER_IN',
  'TRANSFER_OUT',
  'FEE',
  'ADJUSTMENT',
] as const;
export type BankMovementType = (typeof BANK_MOVEMENT_TYPES)[number];

/**
 * Sentido contable de un movimiento en la cuenta bancaria (un activo): débito aumenta el
 * saldo (consignaciones, transferencias recibidas, ajustes) y crédito lo disminuye.
 */
export type BankMovementDirection = 'DEBITO' | 'CREDITO';

export const BANK_MOVEMENT_TYPE_LABELS: Record<BankMovementType, string> = {
  DEPOSIT: 'Consignación',
  WITHDRAWAL: 'Retiro',
  TRANSFER_IN: 'Transferencia recibida',
  TRANSFER_OUT: 'Transferencia enviada',
  FEE: 'Comisión bancaria',
  ADJUSTMENT: 'Ajuste',
};

export interface BankAccountDto {
  id: string;
  bankName: string;
  accountType: BankAccountType;
  accountNumber: string;
  name: string;
  initialBalance: string;
  currentBalance: string;
  currency: string;
  isActive: boolean;
  notes: string | null;
  /** Subcuenta del PUC que representa esta cuenta (p. ej. 11200501) */
  ledgerAccountId: string | null;
  ledgerAccountCode: string | null;
  ledgerAccountName: string | null;
  createdById: string;
  createdAt: string;
  updatedAt: string;
}

export interface BankAccountOptionDto {
  id: string;
  name: string;
  bankName: string;
  accountNumberLast4: string;
}

export interface CreateBankAccountDto {
  bankName: string;
  accountType: BankAccountType;
  accountNumber: string;
  name: string;
  initialBalance?: string;
  notes?: string | null;
  /** Obligatoria: la cuenta bancaria se crea a partir de su subcuenta del PUC */
  ledgerAccountId: string;
}

export interface UpdateBankAccountDto {
  name?: string;
  notes?: string | null;
  isActive?: boolean;
  /** Vincula o cambia la subcuenta del PUC; afecta solo los asientos posteriores */
  ledgerAccountId?: string;
}

export interface BankMovementDto {
  id: string;
  bankAccountId: string;
  movementType: BankMovementType;
  amount: string;
  balanceBefore: string;
  balanceAfter: string;
  concept: string;
  referenceDocumentType: string | null;
  referenceDocumentId: string | null;
  externalReference: string | null;
  movementDate: string;
  createdById: string;
  createdAt: string;
}

export interface CreateBankMovementDto {
  movementType: BankMovementType;
  amount: string;
  concept: string;
  externalReference?: string | null;
  referenceDocumentType?: string | null;
  referenceDocumentId?: string | null;
  movementDate?: string;
  /** F8: cuenta imputable de contrapartida del asiento (obligatoria) */
  counterpartAccountId?: string;
}

export interface BankAccountsSummaryDto {
  totalBalance: string;
  activeAccountsCount: number;
  totalAccountsCount: number;
  currency: string;
}

// ===== RECIBOS DE CAJA Y COMPROBANTES DE EGRESO =====

export type TreasuryDocumentType = 'RECIBO_CAJA' | 'COMPROBANTE_EGRESO';

/**
 * AUTOMATICO: emitido por el trigger de un movimiento (ADR-002). MANUAL, CARTERA y PROVEEDOR:
 * registrados como documento de origen desde Tesorería (ADR-007).
 */
export type TreasuryDocumentOrigin = 'AUTOMATICO' | 'MANUAL' | 'CARTERA' | 'PROVEEDOR';

export type TreasuryVoucherPaymentMethod = 'EFECTIVO' | 'TRANSFERENCIA';

/** Factura que un recibo abona o que un egreso paga, con el valor aplicado. */
export interface TreasuryDocumentApplicationDto {
  documentType: 'FACTURA_VENTA' | 'FACTURA_COMPRA' | 'CAUSACION_GASTO';
  documentId: string;
  documentNumber: string | null;
  amount: string;
  isReversed: boolean;
}

/**
 * Recibo de caja: único registro de ingresos manuales de dinero. MANUAL contabiliza contra la
 * contrapartida elegida; CARTERA abona facturas a crédito del cliente (el valor del recibo es
 * la suma de lo aplicado).
 */
export interface CreateCashReceiptPayload {
  kind: 'MANUAL' | 'CARTERA';
  paymentMethod: TreasuryVoucherPaymentMethod;
  bankAccountId?: string;
  concept: string;
  amount?: string;
  counterpartAccountId?: string;
  thirdPartyId?: string;
  customerId?: string;
  applications?: Array<{ receivableId: string; amount: string }>;
}

/**
 * Comprobante de egreso: único registro de egresos de dinero. MANUAL contabiliza contra la
 * contrapartida elegida; PROVEEDOR paga facturas de compra y causaciones del proveedor.
 */
export interface CreateDisbursementPayload {
  kind: 'MANUAL' | 'PROVEEDOR';
  paymentMethod: TreasuryVoucherPaymentMethod;
  bankAccountId?: string;
  concept: string;
  amount?: string;
  counterpartAccountId?: string;
  thirdPartyId?: string;
  supplierId?: string;
  applications?: Array<{
    documentType: 'FACTURA_COMPRA' | 'CAUSACION_GASTO';
    documentId: string;
    amount: string;
  }>;
}

export interface TreasuryDocumentDto {
  id: string;
  documentType: TreasuryDocumentType;
  /** RC-000001 o CE-000001 */
  documentNumber: string;
  documentDate: string;
  amount: string;
  paymentMethod: string;
  /** Auxiliar al que pertenece: caja o la cuenta bancaria */
  source: 'CAJA' | 'BANCO';
  bankAccountName: string | null;
  concept: string;
  referenceDocumentType: string | null;
  referenceDocumentId: string | null;
  /** Cliente, proveedor o beneficiario, cuando el origen lo identifica */
  thirdPartyName: string | null;
  origin: TreasuryDocumentOrigin;
  counterpartAccount: string | null;
  /** Facturas abonadas o pagadas por el documento */
  applications: TreasuryDocumentApplicationDto[];
  createdByName: string | null;
  createdAt: string;
}

export interface TreasuryDocumentFilters {
  type?: TreasuryDocumentType;
  fromDate?: string;
  toDate?: string;
  search?: string;
  page?: number;
  pageSize?: number;
}
