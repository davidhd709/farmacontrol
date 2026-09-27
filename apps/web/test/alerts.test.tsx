import { ThemeProvider } from '@mui/material';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';
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

const renderPage = () => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <ThemeProvider theme={appTheme}>
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <ExpirationAlertsPage />
        </MemoryRouter>
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

    expect(
      screen.getByText(/Alertas de Vencimiento de Lotes/i),
    ).toBeInTheDocument();

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
      expect(
        screen.getByText(/Escaneo completado: 10 lotes analizados/),
      ).toBeInTheDocument();
    });
  });
});
