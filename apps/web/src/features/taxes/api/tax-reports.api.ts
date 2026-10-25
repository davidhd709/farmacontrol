import type {
  ExogenousDraftDto,
  IcaDraftDto,
  VatDraftDto,
  WithholdingDraftDto,
} from '@farmacia/contracts';
import { apiRequest } from '../../../api/http-client';

/** Borradores tributarios (ADR-006, F8): apoyo para la contadora, no el formulario oficial. */
export const fetchVatDraft = (from: string, to: string) =>
  apiRequest<VatDraftDto>(`tax-reports/vat?from=${from}&to=${to}`);
export const fetchWithholdingDraft = (from: string, to: string) =>
  apiRequest<WithholdingDraftDto>(`tax-reports/withholdings?from=${from}&to=${to}`);
export const fetchIcaDraft = (from: string, to: string) =>
  apiRequest<IcaDraftDto>(`tax-reports/ica?from=${from}&to=${to}`);
export const fetchExogenousDraft = (year: number) =>
  apiRequest<ExogenousDraftDto>(`tax-reports/exogenous?year=${year}`);
