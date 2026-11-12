import { useContext } from 'react';
import { useQuery, QueryClientContext, QueryClient } from '@tanstack/react-query';
import { fetchCompanySettings } from '../api/company.api';

export interface CompanyInfo {
  legalName: string;
  tradeName: string;
  taxId: string;
  taxIdFull: string;
  address: string;
  phone: string;
  email: string;
  sectorProfile: string;
  isLoading: boolean;
}

const fallbackClient = new QueryClient({
  defaultOptions: { queries: { retry: false, staleTime: 1000 * 60 * 30 } },
});

export function useCompanyInfo(): CompanyInfo {
  const contextClient = useContext(QueryClientContext);
  const client = contextClient ?? fallbackClient;

  const { data, isLoading } = useQuery(
    {
      queryKey: ['company-settings'],
      queryFn: fetchCompanySettings,
      staleTime: 1000 * 60 * 30, // 30 minutos de caché
      enabled: typeof window !== 'undefined',
    },
    client,
  );

  const company = data?.company;
  const legalName = company?.legalName || 'FarmaControl';
  const tradeName = company?.tradeName || company?.legalName || 'FarmaControl';
  const taxId = company?.taxId || '';
  const checkDigit = company?.taxIdCheckDigit ? `-${company.taxIdCheckDigit}` : '';
  const taxIdFull = taxId ? `NIT: ${taxId}${checkDigit}` : 'NIT: 900.000.000-1';
  const address = company?.address || 'Dirección Comercial';
  const phone = company?.phone || 'Teléfono de contacto';
  const email = company?.email || 'contacto@farmacontrol.com';
  const sectorProfile = company?.sectorProfile || 'FARMACIA';

  return {
    legalName,
    tradeName,
    taxId,
    taxIdFull,
    address,
    phone,
    email,
    sectorProfile,
    isLoading,
  };
}
