import { apiRequest } from '../../../api/http-client';
import {
  ExpenseDto,
  ExpenseCategoryDto,
  CreateExpenseCategoryPayload,
  UpdateExpenseCategoryPayload,
  CreateExpensePayload,
  CreateExpensePaymentPayload,
  CancelExpensePayload,
  ReverseExpensePaymentPayload,
  ExpenseQueryFilters,
  ExpensesSummaryDto,
  PaginatedResponse,
  BankAccountDto,
} from '@farmacia/contracts';
import { AccountDto } from '../../accounting/api/accounting.api';

export const fetchExpenses = (filters: ExpenseQueryFilters = {}) => {
  const params = new URLSearchParams();
  if (filters.page) params.append('page', String(filters.page));
  if (filters.limit) params.append('limit', String(filters.limit));
  if (filters.startDate) params.append('startDate', filters.startDate);
  if (filters.endDate) params.append('endDate', filters.endDate);
  if (filters.categoryId) params.append('categoryId', filters.categoryId);
  if (filters.status) params.append('status', filters.status);
  if (filters.paymentMethod) params.append('paymentMethod', filters.paymentMethod);
  if (filters.search) params.append('search', filters.search);

  const query = params.toString() ? `?${params.toString()}` : '';
  return apiRequest<PaginatedResponse<ExpenseDto>>(`expenses${query}`);
};

export const fetchExpensesSummary = (filters: ExpenseQueryFilters = {}) => {
  const params = new URLSearchParams();
  if (filters.startDate) params.append('startDate', filters.startDate);
  if (filters.endDate) params.append('endDate', filters.endDate);
  if (filters.categoryId) params.append('categoryId', filters.categoryId);
  if (filters.status) params.append('status', filters.status);
  if (filters.paymentMethod) params.append('paymentMethod', filters.paymentMethod);

  const query = params.toString() ? `?${params.toString()}` : '';
  return apiRequest<ExpensesSummaryDto>(`expenses/summary${query}`);
};

export const fetchExpenseById = (id: string) =>
  apiRequest<ExpenseDto>(`expenses/${encodeURIComponent(id)}`);

export const createExpense = (payload: CreateExpensePayload) =>
  apiRequest<ExpenseDto>('expenses', {
    method: 'POST',
    body: JSON.stringify(payload),
  });

export const payExpense = (id: string, payload: CreateExpensePaymentPayload) =>
  apiRequest<ExpenseDto>(`expenses/${encodeURIComponent(id)}/payments`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });

export const cancelExpense = (id: string, payload: CancelExpensePayload) =>
  apiRequest<ExpenseDto>(`expenses/${encodeURIComponent(id)}/cancel`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });

export const reverseExpensePayment = (paymentId: string, payload: ReverseExpensePaymentPayload) =>
  apiRequest<ExpenseDto>(`expenses/payments/${encodeURIComponent(paymentId)}/reverse`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });

export const fetchExpenseCategories = (includeInactive = false) => {
  const query = includeInactive ? '?includeInactive=true' : '';
  return apiRequest<ExpenseCategoryDto[]>(`expense-categories${query}`);
};

export const createExpenseCategory = (payload: CreateExpenseCategoryPayload) =>
  apiRequest<ExpenseCategoryDto>('expense-categories', {
    method: 'POST',
    body: JSON.stringify(payload),
  });

export const updateExpenseCategory = (id: string, payload: UpdateExpenseCategoryPayload) =>
  apiRequest<ExpenseCategoryDto>(`expense-categories/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });

export const fetchPucAccounts = () => apiRequest<AccountDto[]>('accounts');

export const fetchActiveBankAccounts = async (): Promise<BankAccountDto[]> => {
  const res = await apiRequest<{ accounts: BankAccountDto[] }>('treasury/bank-accounts');
  return (res.accounts || []).filter((a) => a.isActive);
};
