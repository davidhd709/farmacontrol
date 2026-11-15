import { useContext } from 'react';
import { QueryClient, QueryClientContext, useQuery } from '@tanstack/react-query';
import { fetchCompanyLetterhead } from '../api/company.api';

// Los documentos imprimibles también se montan fuera del proveedor de consultas (pruebas, vistas
// sueltas); en ese caso se usa un cliente propio.
const fallbackClient = new QueryClient({
  defaultOptions: { queries: { retry: false, staleTime: 1000 * 60 * 30 } },
});

/**
 * Membrete del emisor para documentos impresos. No inventa
 * datos: lo que la empresa no tenga configurado no se imprime.
 */
export function useCompanyLetterhead(enabled = true) {
  const client = useContext(QueryClientContext) ?? fallbackClient;
  const query = useQuery(
    {
      queryKey: ['company-letterhead'],
      queryFn: fetchCompanyLetterhead,
      staleTime: 1000 * 60 * 30,
      retry: false,
      enabled: enabled && typeof window !== 'undefined',
    },
    client,
  );
  return { company: query.data?.company ?? null, isLoading: query.isLoading };
}
