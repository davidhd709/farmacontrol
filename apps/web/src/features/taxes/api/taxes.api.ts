import type {
  CompanyTaxProfileDto,
  CompanyTaxProfilesDto,
  CreateCompanyTaxProfilePayload,
  ProductTaxProfileDto,
  ProductTaxProfileInput,
  TaxCatalogDto,
} from '@farmacia/contracts';
import { apiRequest } from '../../../api/http-client';

/** Catálogo normativo vigente (ADR-006, F6). */
export const fetchTaxCatalog = () => apiRequest<TaxCatalogDto>('tax-catalog');

export const fetchCompanyTaxProfiles = () =>
  apiRequest<CompanyTaxProfilesDto>('company/tax-profiles');

export const createCompanyTaxProfile = (payload: CreateCompanyTaxProfilePayload) =>
  apiRequest<CompanyTaxProfileDto>('company/tax-profiles', {
    method: 'POST',
    body: JSON.stringify(payload),
  });

export const fetchProductTaxProfiles = (productId: string) =>
  apiRequest<ProductTaxProfileDto[]>(`accounting/tax-profiles?productId=${productId}`);

export const createProductTaxProfile = (payload: ProductTaxProfileInput) =>
  apiRequest<ProductTaxProfileDto>('accounting/tax-profiles', {
    method: 'POST',
    body: JSON.stringify(payload),
  });

export const activateProductTaxProfile = (id: string) =>
  apiRequest<ProductTaxProfileDto>(`accounting/tax-profiles/${id}/activate`, {
    method: 'POST',
    body: JSON.stringify({}),
  });
