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

export interface CreateExpensePayload {
  categoryId: string;
  description: string;
  beneficiary: string;
  documentNumber?: string;
  amount: string | number;
  expenseDate: string;
  dueDate?: string;
  paymentMethod: ExpensePaymentMethod;
  bankAccountId?: string;
  notes?: string;
  supportDocUrl?: string;
}

export interface CreateExpensePaymentPayload {
  amount: string | number;
  paymentDate: string;
  paymentMethod: 'EFECTIVO' | 'TRANSFERENCIA';
  bankAccountId?: string;
  notes?: string;
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
