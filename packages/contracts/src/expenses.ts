export type ExpensePaymentMethod = 'EFECTIVO' | 'TRANSFERENCIA' | 'CREDITO';
export type ExpenseStatus = 'PENDIENTE' | 'PAGADO' | 'ANULADO';

export interface ExpenseCategoryDto {
  id: string;
  name: string;
  description: string | null;
  accountId: string;
  accountCode: string;
  accountName: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CreateExpenseCategoryPayload {
  name: string;
  description?: string;
  accountId: string;
}

export interface UpdateExpenseCategoryPayload {
  name?: string;
  description?: string;
  accountId?: string;
  isActive?: boolean;
}

export interface ExpensePaymentDto {
  id: string;
  expenseId: string;
  amount: string;
  paymentDate: string;
  paymentMethod: 'EFECTIVO' | 'TRANSFERENCIA';
  bankAccountId: string | null;
  bankAccountName: string | null;
  notes: string | null;
  createdById: string;
  createdByName: string | null;
  createdAt: string;
  isReversed: boolean;
  reversedAt: string | null;
  reversalReason: string | null;
  reversedByName: string | null;
}

export interface ExpenseDto {
  id: string;
  categoryId: string;
  categoryName: string;
  accountId: string;
  accountCode: string;
  accountName: string;
  description: string;
  beneficiary: string;
  documentNumber: string | null;
  amount: string;
  amountPaid: string;
  balance: string;
  expenseDate: string;
  dueDate: string | null;
  paymentMethod: ExpensePaymentMethod;
  status: ExpenseStatus;
  supplierId: string | null;
  supplierName: string | null;
  bankAccountId: string | null;
  bankAccountName: string | null;
  notes: string | null;
  supportDocUrl: string | null;
  createdById: string;
  createdByName: string | null;
  createdAt: string;
  cancelledAt: string | null;
  cancellationReason: string | null;
  cancelledByName: string | null;
  payments: ExpensePaymentDto[];
}

/**
 * Causación de gasto: reconoce el gasto y la cuenta por pagar (correcciones del cliente,
 * 2026-11-01). No registra pagos: se pagan con un comprobante de egreso.
 */
export interface CreateExpensePayload {
  categoryId: string;
  description: string;
  /** Proveedor de la causación (obligatorio): el beneficiario es su nombre */
  supplierId: string;
  /** Ignorado: se toma el nombre del proveedor */
  beneficiary?: string;
  documentNumber?: string;
  amount: string | number;
  expenseDate: string;
  dueDate?: string;
  /** Solo CREDITO (o se omite): el pago se registra con un comprobante de egreso */
  paymentMethod?: ExpensePaymentMethod;
  bankAccountId?: string;
  notes?: string;
  supportDocUrl?: string;
}

export interface ReverseExpensePaymentPayload {
  reversalReason: string;
}

export interface CancelExpensePayload {
  cancellationReason: string;
}

export interface ExpenseQueryFilters {
  startDate?: string;
  endDate?: string;
  categoryId?: string;
  status?: ExpenseStatus;
  paymentMethod?: ExpensePaymentMethod;
  search?: string;
  page?: number;
  limit?: number;
}

export interface ExpensesSummaryCategoryBreakdown {
  categoryId: string;
  categoryName: string;
  amount: string;
  count: number;
}

export interface ExpensesSummaryDto {
  totalAmount: string;
  totalPaid: string;
  totalPending: string;
  count: number;
  categoriesBreakdown: ExpensesSummaryCategoryBreakdown[];
}
