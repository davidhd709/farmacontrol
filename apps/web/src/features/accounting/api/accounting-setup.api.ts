import type {
  AccountingSetupDto,
  ApplyPucTemplateResultDto,
  CreateOpeningBalancePayload,
  OpeningBalanceDto,
} from '@farmacia/contracts';
import { apiRequest } from '../../../api/http-client';

/** Asistente de configuración contable (ADR-006, F7). */
export const fetchAccountingSetup = () => apiRequest<AccountingSetupDto>('accounting/setup');

export const applyPucTemplate = () =>
  apiRequest<ApplyPucTemplateResultDto>('accounting/setup/apply-template', {
    method: 'POST',
    body: JSON.stringify({ template: 'PHARMACY' }),
  });

export const fetchOpeningBalance = () =>
  apiRequest<OpeningBalanceDto | { journalEntryId: null }>('accounting/opening-balances');

export const createOpeningBalance = (payload: CreateOpeningBalancePayload) =>
  apiRequest<OpeningBalanceDto>('accounting/opening-balances', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
