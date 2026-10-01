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
