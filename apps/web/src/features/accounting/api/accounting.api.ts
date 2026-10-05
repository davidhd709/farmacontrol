import { apiRequest, ApiError } from '../../../api/http-client';

export type AccountType = 'ASSET' | 'LIABILITY' | 'EQUITY' | 'INCOME' | 'EXPENSE' | 'COST';
export interface AccountDto {
  id: string;
  code: string;
  name: string;
  type: AccountType;
  parentId: string | null;
  level: number;
  allowsMovement: boolean;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}
export interface AccountPayload {
  code: string;
  name: string;
  type: AccountType;
  parentId?: string | null;
  allowsMovement?: boolean;
  isActive?: boolean;
}
export interface PurposeMapping {
  purpose: string;
  status: string;
  accountId: string | null;
  account?: AccountDto | null;
}
export interface ConfigurationStatus {
  total: number;
  configured: number;
  missing: string[];
  status: 'INCOMPLETE' | 'READY';
}
export interface ImportRow {
  row: number;
  code: string;
  name: string;
  type: string;
  parentCode: string | null;
  allowsMovement: boolean | null;
  isActive: boolean | null;
  purpose?: string | null;
  errors: string[];
  warnings: string[];
}
export interface ImportPreview {
  previewHash: string;
  validCount: number;
  errorCount: number;
  warningCount: number;
  rows: ImportRow[];
}

export const fetchAccounts = () => apiRequest<AccountDto[]>('accounts');
export const createAccount = (payload: AccountPayload) =>
  apiRequest<AccountDto>('accounts', { method: 'POST', body: JSON.stringify(payload) });
export const updateAccount = (id: string, payload: Partial<AccountPayload>) =>
  apiRequest<AccountDto>(`accounts/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
export const fetchPurposes = () => apiRequest<PurposeMapping[]>('accounting/purposes');
export const updatePurpose = (purpose: string, accountId: string | null) =>
  apiRequest<PurposeMapping>(`accounting/purposes/${encodeURIComponent(purpose)}`, {
    method: 'PUT',
    body: JSON.stringify({ accountId }),
  });
export const fetchConfigurationStatus = () =>
  apiRequest<ConfigurationStatus>('accounting/configuration-status');

const apiUrl = (import.meta.env.VITE_API_URL || '/api/v1').replace(/\/$/, '');

async function fileRequest(path: string, init: RequestInit): Promise<Response> {
  let response: Response;
  try {
    response = await fetch(`${apiUrl}/${path}`, { ...init, credentials: 'include' });
  } catch {
    throw new ApiError('No fue posible comunicarse con el servidor. Verifica tu conexión.', 0);
  }
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as {
      message?: string | string[];
    } | null;
    const message = Array.isArray(body?.message) ? body.message.join(' ') : body?.message;
    throw new ApiError(message || 'No fue posible procesar el archivo.', response.status, body);
  }
  return response;
}

export async function downloadAccountTemplate(): Promise<void> {
  const response = await fileRequest('accounts/import/template', { method: 'GET' });
  const url = URL.createObjectURL(await response.blob());
  const link = document.createElement('a');
  link.href = url;
  link.download = 'plantilla_plan_de_cuentas.xlsx';
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export async function previewAccountImport(file: File): Promise<ImportPreview> {
  const form = new FormData();
  form.append('file', file);
  const response = await fileRequest('accounts/import/preview', { method: 'POST', body: form });
  return response.json() as Promise<ImportPreview>;
}

export async function confirmAccountImport(
  file: File,
  previewHash: string,
): Promise<{ importedCount: number }> {
  const form = new FormData();
  form.append('file', file);
  form.append('previewHash', previewHash);
  const response = await fileRequest('accounts/import/confirm', { method: 'POST', body: form });
  return response.json() as Promise<{ importedCount: number }>;
}

import type {
  JournalEntryDto,
  JournalEntryQueryFilters,
  ReverseJournalEntryPayload,
  TrialBalanceReportDto,
  GeneralLedgerReportDto,
  IncomeStatementReportDto,
  BalanceSheetReportDto,
  PaginatedResponse,
} from '@farmacia/contracts';

export const fetchJournalEntries = (filters: JournalEntryQueryFilters = {}) => {
  const params = new URLSearchParams();
  if (filters.fromDate) params.append('fromDate', filters.fromDate);
  if (filters.toDate) params.append('toDate', filters.toDate);
  if (filters.sourceType) params.append('sourceType', filters.sourceType);
  if (filters.status) params.append('status', filters.status);
  if (filters.search) params.append('search', filters.search);
  if (filters.page) params.append('page', String(filters.page));
  if (filters.pageSize) params.append('pageSize', String(filters.pageSize));
  const query = params.toString() ? `?${params.toString()}` : '';
  return apiRequest<PaginatedResponse<JournalEntryDto>>(`journal-entries${query}`);
};

export const fetchJournalEntryById = (id: string) =>
  apiRequest<JournalEntryDto>(`journal-entries/${encodeURIComponent(id)}`);

export const reverseJournalEntry = (id: string, payload: ReverseJournalEntryPayload) =>
  apiRequest<JournalEntryDto>(`journal-entries/${encodeURIComponent(id)}/reverse`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });

export const fetchTrialBalance = (fromDate: string, toDate: string) =>
  apiRequest<TrialBalanceReportDto>(
    `accounting/reports/trial-balance?fromDate=${encodeURIComponent(fromDate)}&toDate=${encodeURIComponent(toDate)}`,
  );

export const fetchGeneralLedger = (accountId: string, fromDate: string, toDate: string) =>
  apiRequest<GeneralLedgerReportDto>(
    `accounting/reports/general-ledger?accountId=${encodeURIComponent(accountId)}&fromDate=${encodeURIComponent(fromDate)}&toDate=${encodeURIComponent(toDate)}`,
  );

export const fetchIncomeStatement = (fromDate: string, toDate: string) =>
  apiRequest<IncomeStatementReportDto>(
    `accounting/reports/income-statement?fromDate=${encodeURIComponent(fromDate)}&toDate=${encodeURIComponent(toDate)}`,
  );

export const fetchBalanceSheet = (asOfDate: string) =>
  apiRequest<BalanceSheetReportDto>(
    `accounting/reports/balance-sheet?asOfDate=${encodeURIComponent(asOfDate)}`,
  );

export async function exportTrialBalanceExcel(fromDate: string, toDate: string): Promise<void> {
  const response = await fileRequest(
    `accounting/reports/trial-balance/export?fromDate=${encodeURIComponent(fromDate)}&toDate=${encodeURIComponent(toDate)}`,
    { method: 'GET' },
  );
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `balance_comprobacion_${fromDate}_${toDate}.xlsx`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export async function exportIncomeStatementExcel(fromDate: string, toDate: string): Promise<void> {
  const response = await fileRequest(
    `accounting/reports/income-statement/export?fromDate=${encodeURIComponent(fromDate)}&toDate=${encodeURIComponent(toDate)}`,
    { method: 'GET' },
  );
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `estado_resultados_${fromDate}_${toDate}.xlsx`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export async function exportBalanceSheetExcel(asOfDate: string): Promise<void> {
  const response = await fileRequest(
    `accounting/reports/balance-sheet/export?asOfDate=${encodeURIComponent(asOfDate)}`,
    { method: 'GET' },
  );
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `balance_general_${asOfDate}.xlsx`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

// ===== PERÍODOS CONTABLES Y CIERRE FISCAL =====

export type FiscalPeriodStatus = 'OPEN' | 'CLOSED';

export interface FiscalPeriodDto {
  id: string;
  year: number;
  month: number;
  name: string;
  startDate: string;
  endDate: string;
  status: FiscalPeriodStatus;
  closedAt: string | null;
  closedById: string | null;
  closedByName: string | null;
  reopenedAt: string | null;
  reopenedById: string | null;
  reopenedByName: string | null;
  reopenReason: string | null;
  closingEntryId: string | null;
  notes: string | null;
  entriesCount: number;
  totalDebits: string;
  totalCredits: string;
}

export interface GenerateFiscalPeriodsPayload {
  year: number;
}

export interface CloseFiscalPeriodPayload {
  notes?: string;
  generateClosingEntry?: boolean;
}

export interface ReopenFiscalPeriodPayload {
  reason: string;
}

export const fetchFiscalPeriods = (year?: number, status?: FiscalPeriodStatus) => {
  const params = new URLSearchParams();
  if (year) params.append('year', String(year));
  if (status) params.append('status', status);
  const q = params.toString();
  return apiRequest<FiscalPeriodDto[]>(`accounting/periods${q ? `?${q}` : ''}`);
};

export const generateFiscalPeriods = (payload: GenerateFiscalPeriodsPayload) =>
  apiRequest<FiscalPeriodDto[]>('accounting/periods/generate', {
    method: 'POST',
    body: JSON.stringify(payload),
  });

export const closeFiscalPeriod = (id: string, payload: CloseFiscalPeriodPayload) =>
  apiRequest<FiscalPeriodDto>(`accounting/periods/${encodeURIComponent(id)}/close`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });

export const reopenFiscalPeriod = (id: string, payload: ReopenFiscalPeriodPayload) =>
  apiRequest<FiscalPeriodDto>(`accounting/periods/${encodeURIComponent(id)}/reopen`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });

// ===== REPORTE AUXILIAR DE TERCEROS / MEDIOS MAGNÉTICOS (RF-034) =====

export interface ThirdPartyReportFilters {
  fromDate?: string;
  toDate?: string;
  accountId?: string;
  search?: string;
}

export interface ThirdPartyRowDto {
  documentNumber: string;
  name: string;
  role: 'CUSTOMER' | 'SUPPLIER' | 'BENEFICIARY' | 'OTHER';
  initialBalance: string;
  totalDebit: string;
  totalCredit: string;
  finalBalance: string;
}

export interface ThirdPartyReportDto {
  fromDate: string;
  toDate: string;
  accountId: string | null;
  accountCode: string | null;
  generatedAt: string;
  rows: ThirdPartyRowDto[];
  totalDebit: string;
  totalCredit: string;
}

export const fetchThirdPartyReport = (filters: ThirdPartyReportFilters = {}) => {
  const params = new URLSearchParams();
  if (filters.fromDate) params.append('fromDate', filters.fromDate);
  if (filters.toDate) params.append('toDate', filters.toDate);
  if (filters.accountId) params.append('accountId', filters.accountId);
  if (filters.search) params.append('search', filters.search);
  const q = params.toString();
  return apiRequest<ThirdPartyReportDto>(`accounting/reports/third-parties${q ? `?${q}` : ''}`);
};

export async function exportThirdPartyReportExcel(filters: ThirdPartyReportFilters = {}): Promise<void> {
  const params = new URLSearchParams();
  if (filters.fromDate) params.append('fromDate', filters.fromDate);
  if (filters.toDate) params.append('toDate', filters.toDate);
  if (filters.accountId) params.append('accountId', filters.accountId);
  if (filters.search) params.append('search', filters.search);
  const q = params.toString();

  const response = await fileRequest(
    `accounting/reports/third-parties/export${q ? `?${q}` : ''}`,
    { method: 'GET' },
  );
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `reporte_terceros_${filters.fromDate || 'inicio'}_${filters.toDate || 'corte'}.xlsx`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

// ===== NOTAS CRÉDITO Y NOTAS DÉBITO (RF-033) =====

export interface CreateCreditNoteLinePayload {
  saleLineId: string;
  quantityCommercial: number;
}

export interface CreateCreditNotePayload {
  saleId: string;
  reason: string;
  refundMethod?: 'EFECTIVO' | 'CREDITO_CARTERA' | 'TRANSFERENCIA' | 'SALDO_A_FAVOR';
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

export const fetchSaleCreditNotes = (saleId: string) =>
  apiRequest<CreditNoteDto[]>(`sales/${encodeURIComponent(saleId)}/credit-notes`);

export const createSaleCreditNote = (saleId: string, payload: CreateCreditNotePayload) =>
  apiRequest<CreditNoteDto>(`sales/${encodeURIComponent(saleId)}/credit-notes`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });

export const fetchAllCreditNotes = (saleId?: string) => {
  const q = saleId ? `?saleId=${encodeURIComponent(saleId)}` : '';
  return apiRequest<CreditNoteDto[]>(`credit-notes${q}`);
};

export interface CreateDebitNoteLinePayload {
  purchaseLineId: string;
  quantityCommercial: number;
}

export interface CreateDebitNotePayload {
  purchaseId: string;
  reason: string;
  items: CreateDebitNoteLinePayload[];
}

export interface DebitNoteLineDto {
  id: string;
  debitNoteId: string;
  purchaseLineId: string;
  productId: string;
  productCode?: string;
  productName?: string;
  lotId?: string | null;
  lotNumber?: string | null;
  quantityCommercial: number;
  quantityBaseUnits: number;
  unitCost: number;
  subtotal: number;
  taxRate: number;
  taxAmount: number;
  total: number;
  createdAt: string;
}

export interface DebitNoteDto {
  id: string;
  debitNoteNumber: string;
  purchaseId: string;
  purchaseInvoiceNumber?: string;
  supplierId: string;
  supplierName?: string;
  supplierTaxId?: string;
  reason: string;
  subtotal: number;
  taxTotal: number;
  total: number;
  createdById: string;
  createdByName?: string | null;
  createdAt: string;
  lines: DebitNoteLineDto[];
}

export const fetchPurchaseDebitNotes = (purchaseId: string) =>
  apiRequest<DebitNoteDto[]>(`purchases/${encodeURIComponent(purchaseId)}/debit-notes`);

export const createPurchaseDebitNote = (purchaseId: string, payload: CreateDebitNotePayload) =>
  apiRequest<DebitNoteDto>(`purchases/${encodeURIComponent(purchaseId)}/debit-notes`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });

export const fetchAllDebitNotes = (purchaseId?: string) => {
  const q = purchaseId ? `?purchaseId=${encodeURIComponent(purchaseId)}` : '';
  return apiRequest<DebitNoteDto[]>(`debit-notes${q}`);
};


