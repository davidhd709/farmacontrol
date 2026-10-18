import { ThemeProvider } from '@mui/material';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SYSTEM_PERMISSIONS } from '@farmacia/contracts';
import { AuthContext, type AuthContextValue } from '../src/features/auth/context/auth-context';
import type { AlertsSummaryDto, InventoryAlertDto } from '@farmacia/contracts';
import * as alertsApi from '../src/features/alerts/api/alerts.api';
import { ExpirationAlertsPage } from '../src/features/alerts/pages/ExpirationAlertsPage';
import { appTheme } from '../src/theme/app-theme';

const mockSummary: AlertsSummaryDto = {
  totalActive: 4,
  vencidos: 1,
  criticos: 1,
  alertas: 1,
  proximos: 1,
  lastEvaluatedAt: '2026-09-26T22:00:00.000Z',
};

const mockAlerts: InventoryAlertDto[] = [
  {
    id: 'alt-1',
    lotId: 'lot-1',
    lotNumber: 'LOT-VENC-01',
    productId: 'prod-1',
    productCode: 'MED-001',
    productName: 'Amoxicilina 500mg',
    categoryName: 'Antibióticos',
    locationId: 'loc-1',
    locationName: 'Bodega Principal',
    expirationDate: '2026-05-27',
    daysRemaining: -5,
    severity: 'VENCIDO',
    currentQuantity: 25,
    baseUnit: 'CAP',
    isResolved: false,
    resolvedAt: null,
    lastEvaluatedAt: '2026-09-26T22:00:00.000Z',
    createdAt: '2026-09-26T22:00:00.000Z',
  },
  {
    id: 'alt-2',
    lotId: 'lot-2',
    lotNumber: 'LOT-CRIT-02',
    productId: 'prod-2',
    productCode: 'MED-002',
    productName: 'Ibuprofeno 400mg',
    categoryName: 'Analgésicos',
    locationId: 'loc-1',
    locationName: 'Bodega Principal',
    expirationDate: '2026-06-15',
    daysRemaining: 15,
    severity: 'CRITICO',
    currentQuantity: 50,
    baseUnit: 'TAB',
    isResolved: false,
    resolvedAt: null,
    lastEvaluatedAt: '2026-09-26T22:00:00.000Z',
    createdAt: '2026-09-26T22:00:00.000Z',
  },
  {
    id: 'alt-3',
    lotId: 'lot-3',
    lotNumber: 'LOT-ALER-03',
    productId: 'prod-3',
    productCode: 'MED-003',
    productName: 'Loratadina 10mg',
    categoryName: 'Antihistamínicos',
    locationId: 'loc-1',
    locationName: 'Estante B',
    expirationDate: '2026-07-15',
    daysRemaining: 45,
    severity: 'ALERTA',
    currentQuantity: 80,
    baseUnit: 'TAB',
    isResolved: false,
    resolvedAt: null,
    lastEvaluatedAt: '2026-09-26T22:00:00.000Z',
    createdAt: '2026-09-26T22:00:00.000Z',
  },
  {
    id: 'alt-4',
    lotId: 'lot-4',
    lotNumber: 'LOT-PROX-04',
    productId: 'prod-4',
    productCode: 'MED-004',
    productName: 'Omeprazol 20mg',
    categoryName: 'Gastroenterología',
    locationId: 'loc-1',
    locationName: 'Bodega Principal',
    expirationDate: '2026-08-15',
    daysRemaining: 75,
    severity: 'PROXIMO',
    currentQuantity: 120,
    baseUnit: 'CAP',
    isResolved: false,
    resolvedAt: null,
    lastEvaluatedAt: '2026-09-26T22:00:00.000Z',
    createdAt: '2026-09-26T22:00:00.000Z',
  },
];

function Location() {
  const location = useLocation();
  return (
    <output aria-label="Ubicación">
      {location.pathname}
      {location.search}
    </output>
  );
}

const renderPage = (
  path = '/alerts',
  permissions: string[] = [SYSTEM_PERMISSIONS.INVENTORY_READ, SYSTEM_PERMISSIONS.ALERTS_READ],
) => {
  const auth: AuthContextValue = {
    user: { id: 'operator', username: 'Operador', isActive: true, roles: [], permissions },
    status: 'authenticated',
    sessionError: null,
    isLoggingIn: false,
    isLoggingOut: false,
    login: vi.fn(),
    logout: vi.fn(),
    retrySession: vi.fn(),
  };
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <ThemeProvider theme={appTheme}>
      <QueryClientProvider client={queryClient}>
        <AuthContext.Provider value={auth}>
          <MemoryRouter initialEntries={[path]}>
            <ExpirationAlertsPage />
            <Location />
          </MemoryRouter>
        </AuthContext.Provider>
      </QueryClientProvider>
    </ThemeProvider>,
  );
};

describe('ExpirationAlertsPage (UX-14 — Alertas de Vencimiento)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(alertsApi, 'fetchAlertsSummary').mockResolvedValue(mockSummary);
    vi.spyOn(alertsApi, 'fetchExpirations').mockResolvedValue({
      items: mockAlerts,
      total: mockAlerts.length,
      page: 1,
      pageSize: 10,
      totalPages: 1,
    });
  });

  it('debe renderizar el título de la pantalla, las tarjetas de métricas y la tabla con lotes', async () => {
    renderPage();

    expect(screen.getByText(/Alertas de Vencimiento de Lotes/i)).toBeInTheDocument();

    // Esperar datos cargados en tarjetas de resumen
    await waitFor(() => {
      expect(screen.getByText('TOTAL EN RIESGO')).toBeInTheDocument();
      expect(screen.getByText('🔴 VENCIDOS (≤ 0d)')).toBeInTheDocument();
      expect(screen.getByText('🟠 CRÍTICOS (< 30d)')).toBeInTheDocument();
      expect(screen.getByText('🟡 EN ALERTA (31-60d)')).toBeInTheDocument();
      expect(screen.getByText('🔵 PRÓXIMOS (61-90d)')).toBeInTheDocument();
    });

    // Comprobar filas de lotes en la tabla
    await waitFor(() => {
      expect(screen.getByText('Amoxicilina 500mg')).toBeInTheDocument();
      expect(screen.getByText('LOT-VENC-01')).toBeInTheDocument();
      expect(screen.getByText('Ibuprofeno 400mg')).toBeInTheDocument();
      expect(screen.getByText('LOT-CRIT-02')).toBeInTheDocument();
    });

    // Comprobar chips de severidad
    expect(screen.getByTestId('chip-severity-vencido')).toBeInTheDocument();
    expect(screen.getByTestId('chip-severity-critico')).toBeInTheDocument();
    expect(screen.getByTestId('chip-severity-alerta')).toBeInTheDocument();
    expect(screen.getByTestId('chip-severity-proximo')).toBeInTheDocument();
  });

  it('debe filtrar alertas cuando el usuario escribe en el campo de búsqueda', async () => {
    renderPage();

    await waitFor(() => {
      expect(screen.getByText('Amoxicilina 500mg')).toBeInTheDocument();
    });

    const searchInput = screen.getByPlaceholderText(/Buscar por producto/i);
    fireEvent.change(searchInput, { target: { value: 'Amoxi' } });

    await waitFor(() => {
      expect(alertsApi.fetchExpirations).toHaveBeenCalledWith(
        expect.objectContaining({ search: 'Amoxi' }),
      );
    });
  });

  it('abre CRITICO desde URL, filtra filas, enlaza movimientos y limpia la severidad', async () => {
    vi.mocked(alertsApi.fetchExpirations).mockImplementation(async (filters) => ({
      items: mockAlerts.filter((row) => !filters?.severity || row.severity === filters.severity),
      total: 1,
      page: 1,
      pageSize: 10,
      totalPages: 1,
    }));
    renderPage('/alerts?severity=CRITICO');
    expect(await screen.findByText('LOT-CRIT-02')).toBeInTheDocument();
    expect(screen.queryByText('LOT-VENC-01')).not.toBeInTheDocument();
    expect(alertsApi.fetchExpirations).toHaveBeenCalledWith(
      expect.objectContaining({ severity: 'CRITICO', page: 1 }),
    );
    expect(
      screen.getByRole('link', { name: 'Ver movimientos del lote LOT-CRIT-02' }),
    ).toHaveAttribute('href', '/inventory/movements?lotId=lot-2');
    fireEvent.click(screen.getByRole('button', { name: 'Limpiar filtros' }));
    expect(screen.getByLabelText('Ubicación')).toHaveTextContent('/alerts');
    expect(screen.getByLabelText('Ubicación')).not.toHaveTextContent('severity');
    expect(await screen.findByText('LOT-VENC-01')).toBeInTheDocument();
  });

  it('contador actualiza URL y búsqueda y filtros reinician paginación', async () => {
    vi.mocked(alertsApi.fetchExpirations).mockResolvedValue({
      items: mockAlerts,
      total: 20,
      page: 1,
      pageSize: 10,
      totalPages: 2,
    });
    renderPage();
    await screen.findByText('LOT-CRIT-02');
    fireEvent.click(screen.getByRole('button', { name: /page 2/i }));
    await waitFor(() =>
      expect(alertsApi.fetchExpirations).toHaveBeenLastCalledWith(
        expect.objectContaining({ page: 2 }),
      ),
    );
    fireEvent.change(screen.getByPlaceholderText(/Buscar por producto/i), {
      target: { value: 'LOT' },
    });
    await waitFor(() =>
      expect(alertsApi.fetchExpirations).toHaveBeenLastCalledWith(
        expect.objectContaining({ page: 1, search: 'LOT' }),
      ),
    );
    fireEvent.click(screen.getByRole('button', { name: /CRÍTICOS/ }));
    expect(screen.getByLabelText('Ubicación')).toHaveTextContent('severity=CRITICO');
    await waitFor(() =>
      expect(alertsApi.fetchExpirations).toHaveBeenLastCalledWith(
        expect.objectContaining({ severity: 'CRITICO', page: 1 }),
      ),
    );
  });

  it('oculta acceso a movimientos sin inventory:read', async () => {
    renderPage('/alerts', [SYSTEM_PERMISSIONS.ALERTS_READ]);
    await screen.findByText('LOT-CRIT-02');
    expect(screen.queryByRole('link', { name: /Ver movimientos/ })).not.toBeInTheDocument();
  });

  it('debe disparar escaneo manual de lotes al presionar "Escanear Lotes Ahora"', async () => {
    vi.spyOn(alertsApi, 'triggerAlertsEvaluation').mockResolvedValue({
      evaluatedLots: 10,
      createdAlerts: 2,
      updatedAlerts: 1,
      resolvedAlerts: 0,
      timestamp: new Date().toISOString(),
    });

    renderPage();

    const scanBtn = screen.getByTestId('trigger-scan-btn');
    fireEvent.click(scanBtn);

    await waitFor(() => {
      expect(alertsApi.triggerAlertsEvaluation).toHaveBeenCalledTimes(1);
    });

    await waitFor(() => {
      expect(screen.getByTestId('action-feedback-alert')).toBeInTheDocument();
      expect(screen.getByText(/Escaneo completado: 10 lotes analizados/)).toBeInTheDocument();
    });
  });
});
