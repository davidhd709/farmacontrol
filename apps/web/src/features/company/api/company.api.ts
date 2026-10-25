import type {
  AccountingPolicyDto,
  BranchDto,
  CompanyDto,
  CompanySettingsDto,
  CreateAccountingPolicyPayload,
  CreateBranchPayload,
  SetupCompanyPayload,
  UpdateCompanyPayload,
} from '@farmacia/contracts';
import { apiRequest } from '../../../api/http-client';

export const fetchCompanySettings = () => apiRequest<CompanySettingsDto>('company');

export const setupCompany = (payload: SetupCompanyPayload) =>
  apiRequest<CompanyDto>('company/setup', { method: 'POST', body: JSON.stringify(payload) });

export const updateCompany = (payload: UpdateCompanyPayload) =>
  apiRequest<CompanyDto>('company', { method: 'PATCH', body: JSON.stringify(payload) });

export const createBranch = (payload: CreateBranchPayload) =>
  apiRequest<BranchDto>('company/branches', { method: 'POST', body: JSON.stringify(payload) });

export const createAccountingPolicy = (payload: CreateAccountingPolicyPayload) =>
  apiRequest<AccountingPolicyDto>('company/accounting-policies', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
