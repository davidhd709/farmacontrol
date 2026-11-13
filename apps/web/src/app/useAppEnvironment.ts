import { useQuery } from '@tanstack/react-query';
import type { AppEnvironment, HealthStatus } from '@farmacia/contracts';
import { apiRequest } from '../api/http-client';

const LABELS: Record<AppEnvironment, string> = {
  produccion: 'Producción',
  pruebas: 'Pruebas',
  desarrollo: 'Desarrollo',
};

export interface AppEnvironmentInfo {
  environment: AppEnvironment | null;
  label: string | null;
}

/**
 * Ambiente del despliegue según el API (`APP_ENVIRONMENT`), no según el nombre de la empresa ni
 * el build. Sin respuesta o sin la variable no hay etiqueta: nunca se presume producción.
 */
export function useAppEnvironment(): AppEnvironmentInfo {
  const { data } = useQuery({
    queryKey: ['app-environment'],
    queryFn: () => apiRequest<HealthStatus>('health'),
    staleTime: Infinity,
    retry: false,
  });
  const environment = data?.environment ?? null;
  return { environment, label: environment ? LABELS[environment] : null };
}
