import { ThemeProvider } from '@mui/material';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SYSTEM_PERMISSIONS as P } from '@farmacia/contracts';
import { AuthContext, type AuthContextValue } from '../src/features/auth/context/auth-context';
import { AuthenticatedHomePage } from '../src/pages/AuthenticatedHomePage';
import { ReportsPage } from '../src/features/reports/pages/ReportsPage';
import { appTheme } from '../src/theme/app-theme';
import * as cashApi from '../src/features/cash/api/cash.api';
import * as treasuryApi from '../src/features/treasury/api/treasury.api';
import * as receivablesApi from '../src/features/receivables/api/receivables.api';
import * as reportsApi from '../src/features/reports/api/reports.api';
import * as alertsApi from '../src/features/alerts/api/alerts.api';
import { businessToday } from '../src/utils/business-date';

function Location() {
  const location = useLocation();
  return (
    <output aria-label="Ubicación">
      {location.pathname}
      {location.search}
    </output>
  );
}

function renderDashboard(permissions: string[], report = false, path = '/') {
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
  return render(
    <ThemeProvider theme={appTheme}>
      <QueryClientProvider
        client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
      >
        <AuthContext.Provider value={auth}>
          <MemoryRouter initialEntries={[path]}>
            {report ? <ReportsPage /> : <AuthenticatedHomePage />}
            <Location />
          </MemoryRouter>
        </AuthContext.Provider>
      </QueryClientProvider>
    </ThemeProvider>,
  );
}

describe('Panel T-02', () => {
  beforeEach(() => {
    vi.spyOn(cashApi, 'fetchCashBalance').mockResolvedValue({
      currentBalance: 100000,
      totalIncomeToday: 100000,
      totalExpenseToday: 0,
      movementsCountToday: 1,
    });
    vi.spyOn(treasuryApi, 'getBankAccountSummary').mockResolvedValue({
      totalBalance: '50000.00',
      activeAccountsCount: 1,
      totalAccountsCount: 1,
      currency: 'COP',
    });
    vi.spyOn(receivablesApi, 'fetchReceivablesAgingSummary').mockResolvedValue({
      totalPending: '250000.00',
      totalCount: 75,
      current: { amount: '250000.00', count: 75 },
      days1To30: { amount: '0', count: 0 },
      days31To60: { amount: '0', count: 0 },
      days61To90: { amount: '0', count: 0 },
      daysOver90: { amount: '0', count: 0 },
    });
    vi.spyOn(receivablesApi, 'fetchReceivables');
    vi.spyOn(reportsApi, 'fetchSalesReport').mockResolvedValue({
      generatedAt: '2026-10-18T15:00:00Z',
      fromDate: businessToday(),
      toDate: businessToday(),
      totalSales: 2,
      totalAmount: 150000,
      byPaymentMethod: { EFECTIVO: 100000, TRANSFERENCIA: 50000 },
      items: [],
    });
    vi.spyOn(alertsApi, 'fetchAlertsSummary').mockResolvedValue({
      totalActive: 9,
      vencidos: 1,
      criticos: 5,
      alertas: 2,
      proximos: 1,
      lastEvaluatedAt: null,
    });
  });

  it('separa 100.000 de efectivo de 50.000 de bancos y usa cartera agregada de más de 50 cuentas', async () => {
    renderDashboard([
      P.CASH_READ,
      P.TREASURY_READ,
      P.RECEIVABLES_READ,
      P.REPORTS_READ,
      P.USERS_READ,
    ]);
    const cash = screen.getByRole('region', { name: 'Efectivo en caja' });
    const banks = screen.getByRole('region', { name: 'Bancos' });
    expect(await within(cash).findByText(/100\.000/)).toBeInTheDocument();
    expect(await within(banks).findByText(/50\.000/)).toBeInTheDocument();
    expect(within(cash).queryByText(/150\.000/)).not.toBeInTheDocument();
    expect(
      await within(screen.getByRole('region', { name: 'Cartera de clientes' })).findByText(
        /250\.000/,
      ),
    ).toBeInTheDocument();
    expect(receivablesApi.fetchReceivables).not.toHaveBeenCalled();
    expect(screen.queryByText('Gestión de Usuarios')).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Ver caja' })).toHaveAttribute('href', '/cash');
    expect(screen.getByRole('link', { name: 'Ver bancos' })).toHaveAttribute(
      'href',
      '/treasury/bank-accounts',
    );
    expect(screen.getByRole('link', { name: 'Ver cartera' })).toHaveAttribute(
      'href',
      '/receivables',
    );
  });

  it('omite indicadores y consultas sin su permiso, incluso con sales:read y users:read', () => {
    renderDashboard([P.SALES_READ, P.USERS_READ]);
    for (const label of [
      'Ventas de hoy',
      'Efectivo en caja',
      'Bancos',
      'Cartera de clientes',
      'Gestión de Usuarios',
    ])
      expect(screen.queryByText(label)).not.toBeInTheDocument();
    for (const fn of [
      cashApi.fetchCashBalance,
      treasuryApi.getBankAccountSummary,
      receivablesApi.fetchReceivablesAgingSummary,
      reportsApi.fetchSalesReport,
      alertsApi.fetchAlertsSummary,
    ])
      expect(fn).not.toHaveBeenCalled();
  });

  it('muestra No disponible al fallar caja, mantiene bancos y permite reintentar', async () => {
    vi.mocked(cashApi.fetchCashBalance).mockRejectedValueOnce(new Error('offline'));
    renderDashboard([P.CASH_READ, P.TREASURY_READ]);
    const cash = screen.getByRole('region', { name: 'Efectivo en caja' });
    expect(await within(cash).findByText('No disponible')).toBeInTheDocument();
    expect(within(cash).queryByText(/\$\s*0/)).not.toBeInTheDocument();
    expect(
      await within(screen.getByRole('region', { name: 'Bancos' })).findByText(/50\.000/),
    ).toBeInTheDocument();
    fireEvent.click(within(cash).getByRole('button', { name: 'Reintentar Efectivo en caja' }));
    expect(await within(cash).findByText(/100\.000/)).toBeInTheDocument();
  });

  it('muestra ventas de hoy y enlaza al mismo período de Bogotá', async () => {
    // A las 02:00 UTC del 19 aún es 18 en Bogotá.
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-19T02:00:00Z'));
    try {
      renderDashboard([P.REPORTS_READ]);
      expect(await screen.findByText('2 ventas')).toBeInTheDocument();
      expect(reportsApi.fetchSalesReport).toHaveBeenCalledWith({
        fromDate: '2026-10-18',
        toDate: '2026-10-18',
      });
      expect(screen.getByRole('link', { name: 'Ver ventas de hoy' })).toHaveAttribute(
        'href',
        '/reports?tab=sales&fromDate=2026-10-18&toDate=2026-10-18',
      );
    } finally {
      vi.useRealTimers();
    }
  });

  it('clic en contador crítico navega con severidad', async () => {
    renderDashboard([P.INVENTORY_READ, P.ALERTS_READ]);
    fireEvent.click(await screen.findByRole('link', { name: 'Críticos: 5' }));
    expect(screen.getByLabelText('Ubicación')).toHaveTextContent('/alerts?severity=CRITICO');
  });

  it('lista como pendientes los vencidos y críticos, con la acción que los resuelve', async () => {
    renderDashboard([P.INVENTORY_READ, P.ALERTS_READ]);
    const pending = await screen.findByRole('region', { name: 'Pendientes' });
    expect(await within(pending).findByText(/1 lote vencido con existencias/)).toBeInTheDocument();
    expect(within(pending).getByText(/5 lotes vencen en 30 días o menos/)).toBeInTheDocument();
    expect(within(pending).getByRole('link', { name: 'Revisar vencidos' })).toHaveAttribute(
      'href',
      '/alerts?severity=VENCIDO',
    );
  });

  it('sin pendientes lo dice, y el inicio no muestra conteo de permisos ni avisos técnicos', async () => {
    vi.mocked(alertsApi.fetchAlertsSummary).mockResolvedValue({
      totalActive: 0,
      vencidos: 0,
      criticos: 0,
      alertas: 0,
      proximos: 0,
      lastEvaluatedAt: null,
    });
    renderDashboard([P.INVENTORY_READ, P.ALERTS_READ, P.RECEIVABLES_READ]);
    expect(await screen.findByText('No hay pendientes que requieran acción.')).toBeInTheDocument();
    expect(screen.queryByText(/permisos habilitados/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/FEFO/)).not.toBeInTheDocument();
  });

  it('accesos frecuentes según el perfil: el cajero ve Nueva venta, no Recibir compra', () => {
    renderDashboard([P.SALES_CREATE, P.SALES_READ]);
    const shortcuts = screen.getByRole('region', { name: 'Accesos frecuentes' });
    expect(within(shortcuts).getByRole('link', { name: 'Nueva venta' })).toHaveAttribute(
      'href',
      '/pos',
    );
    expect(
      within(shortcuts).queryByRole('link', { name: 'Recibir compra' }),
    ).not.toBeInTheDocument();
  });

  it('el destino de ventas aplica el período recibido en la URL', async () => {
    renderDashboard(
      [P.REPORTS_READ],
      true,
      '/reports?tab=sales&fromDate=2026-10-18&toDate=2026-10-18',
    );
    await waitFor(() =>
      expect(reportsApi.fetchSalesReport).toHaveBeenCalledWith({
        fromDate: '2026-10-18',
        toDate: '2026-10-18',
      }),
    );
    expect(screen.getByTestId('tab-sales')).toHaveAttribute('aria-selected', 'true');
  });
});
