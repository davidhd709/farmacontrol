export type SaleStatus = 'COMPLETED' | 'CANCELLED';

export type SalePaymentMethod =
  | 'EFECTIVO'
  | 'TRANSFERENCIA'
  | 'TARJETA_DEBITO'
  | 'TARJETA_CREDITO';

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
  amountPaid?: number; // Requerido para cálculo de cambio si es efectivo
  notes?: string;
  items: ConfirmSaleLineItemPayload[];
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
