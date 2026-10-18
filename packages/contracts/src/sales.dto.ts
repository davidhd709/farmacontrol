export type SaleStatus = 'COMPLETED' | 'CANCELLED';

export type SalePaymentMethod =
  | 'EFECTIVO'
  | 'TRANSFERENCIA'
  | 'TARJETA_DEBITO'
  | 'TARJETA_CREDITO'
  | 'CREDITO';

export interface SaleLotAllocationDto {
  id: string;
  lotId: string;
  lotNumber?: string;
  expirationDate?: string;
  quantityBaseUnits: number;
}

export interface SaleLineDto {
  id: string;
  productId: string;
  productCode?: string;
  productName?: string;
  presentationId?: string | null;
  presentationName?: string | null;
  presentationFactorHistorical: number;
  quantityCommercial: number;
  quantityBaseUnits: number;
  unitPrice: number;
  discount: number;
  subtotal: number;
  taxRate: number;
  taxAmount: number;
  total: number;
  lotAllocations?: SaleLotAllocationDto[];
}

export interface SaleDto {
  id: string;
  invoiceNumber: string;
  customerId: string;
  customerName?: string;
  customerDocument?: string;
  status: SaleStatus;
  paymentMethod: SalePaymentMethod;
  bankAccountId?: string | null;
  subtotal: number;
  taxTotal: number;
  discountTotal: number;
  total: number;
  amountPaid: number;
  changeGiven: number;
  notes?: string | null;
  createdById: string;
  createdByUsername?: string;
  lines: SaleLineDto[];
  createdAt: string;
}

export interface ConfirmSaleLineItemPayload {
  productId: string;
  presentationId?: string | null;
  quantityCommercial: number;
  unitPriceOverride?: number;
  discount?: number;
}

export interface ConfirmSalePayload {
  customerId?: string; // Opcional: si se omite, se asigna el cliente predeterminado (Consumidor Final)
  paymentMethod: SalePaymentMethod;
  bankAccountId?: string; // Obligatoria para TRANSFERENCIA.
  amountPaid?: number; // Requerido para cálculo de cambio si es efectivo
  notes?: string;
  items: ConfirmSaleLineItemPayload[];
}

// ===== VISTA PREVIA FEFO (POS) =====
// Consulta de sólo lectura: muestra qué lotes usaría la venta si se confirmara ahora. No
// reserva existencias; la asignación definitiva la hace la confirmación con bloqueo.

export interface FefoPreviewLinePayload {
  productId: string;
  presentationId?: string | null;
  quantityCommercial: number;
}

export interface FefoPreviewPayload {
  items: FefoPreviewLinePayload[];
}

export interface FefoPreviewAllocationDto {
  lotId: string;
  lotNumber: string;
  /** Día de vencimiento (YYYY-MM-DD) */
  expirationDate: string;
  quantityBaseUnits: number;
}

export interface FefoPreviewLineDto {
  productId: string;
  presentationId: string | null;
  requiredBaseUnits: number;
  /** Unidades vendibles que quedan para esta línea después de las líneas anteriores del mismo producto */
  availableBaseUnits: number;
  /** Unidades que faltan; 0 cuando la línea se cubre completa */
  shortfallBaseUnits: number;
  allocations: FefoPreviewAllocationDto[];
}

export interface FefoPreviewDto {
  /** Día de negocio (Bogotá) usado para excluir lotes vencidos */
  businessDay: string;
  lines: FefoPreviewLineDto[];
}

export interface SaleQueryFilters {
  invoiceNumber?: string;
  customerId?: string;
  fromDate?: string;
  toDate?: string;
  status?: SaleStatus;
  page?: number;
  limit?: number;
}

// ===== NOTAS CRÉDITO / DEVOLUCIONES EN VENTAS (RF-033) =====

export interface CreateCreditNoteLinePayload {
  saleLineId: string;
  quantityCommercial: number;
}

export interface CreateCreditNotePayload {
  saleId: string;
  reason: string;
  refundMethod?: 'EFECTIVO' | 'CREDITO_CARTERA' | 'TRANSFERENCIA';
  restock?: boolean;
  items: CreateCreditNoteLinePayload[];
}

export interface CreditNoteLineDto {
  id: string;
  creditNoteId: string;
  saleLineId: string;
  productId: string;
  productCode?: string;
  productName?: string;
  lotId?: string | null;
  lotNumber?: string | null;
  quantityCommercial: number;
  quantityBaseUnits: number;
  unitPrice: number;
  subtotal: number;
  taxRate: number;
  taxAmount: number;
  total: number;
  createdAt: string;
}

export interface CreditNoteDto {
  id: string;
  creditNoteNumber: string;
  saleId: string;
  saleInvoiceNumber?: string;
  customerId: string;
  customerName?: string;
  customerDocument?: string;
  reason: string;
  subtotal: number;
  taxTotal: number;
  total: number;
  refundMethod: string;
  restock: boolean;
  createdById: string;
  createdByName?: string | null;
  createdAt: string;
  lines: CreditNoteLineDto[];
}

