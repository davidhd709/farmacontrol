import { ThemeProvider } from '@mui/material';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  SYSTEM_PERMISSIONS,
  SYSTEM_ROLES,
  type CashMovementDto,
  type CashBalanceDto,
} from '@farmacia/contracts';
import { AuthContext, type AuthContextValue } from '../src/features/auth/context/auth-context';
import * as cashApi from '../src/features/cash/api/cash.api';
import { CashPage } from '../src/features/cash/pages/CashPage';
import { appTheme } from '../src/theme/app-theme';

const mockBalance: CashBalanceDto = {
  currentBalance: 75000,
  totalIncomeToday: 100000,
  totalExpenseToday: 25000,
  movementsCountToday: 2,
  lastMovementAt: '2026-09-26T15:30:00.000Z',
};

const mockMovements: CashMovementDto[] = [
  {
    id: 'mov-2',
    movementType: 'EGRESO_MANUAL',
    amount: 25000,
    paymentMethod: 'EFECTIVO',
    reason: 'Pago de mensajería urgente',
    balanceAfter: 75000,
    createdAt: '2026-09-26T15:30:00.000Z',
    createdByUserId: 'user-cajero',
    createdByUsername: 'cajero_1',
  },
  {
    id: 'mov-1',
    movementType: 'INGRESO_MANUAL',
    amount: 100000,
    paymentMethod: 'EFECTIVO',
    reason: 'Base de caja inicial de turno',
    balanceAfter: 100000,
    createdAt: '2026-09-26T08:00:00.000Z',
    createdByUserId: 'user-cajero',
    createdByUsername: 'cajero_1',
  },
];

const mockAuthContext: AuthContextValue = {
  user: {
    id: 'user-cajero',
    username: 'cajero_1',
    isActive: true,
    roles: [SYSTEM_ROLES.CAJERO],
    permissions: [SYSTEM_PERMISSIONS.CASH_READ, SYSTEM_PERMISSIONS.CASH_MOVEMENTS],
  },
  roles: [SYSTEM_ROLES.CAJERO],
  permissions: [SYSTEM_PERMISSIONS.CASH_READ, SYSTEM_PERMISSIONS.CASH_MOVEMENTS],
  isAuthenticated: true,
  isLoading: false,
  error: null,
  login: vi.fn(),
  logout: vi.fn(),
  refreshSession: vi.fn(),
};

const renderWithProviders = (ui: React.ReactElement) => {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <ThemeProvider theme={appTheme}>
      <QueryClientProvider client={queryClient}>
        <AuthContext.Provider value={mockAuthContext}>
          <MemoryRouter>{ui}</MemoryRouter>
        </AuthContext.Provider>
      </QueryClientProvider>
    </ThemeProvider>,
  );
};

describe('Operación de Caja — Pantalla CashPage (UX-25)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(cashApi, 'fetchCashBalance').mockResolvedValue(mockBalance);
    vi.spyOn(cashApi, 'fetchCashMovements').mockResolvedValue({
      items: mockMovements,
      total: mockMovements.length,
      page: 1,
      pageSize: 15,
      totalPages: 1,
    });
  });

  it('renderiza correctamente el saldo actual en caja, las métricas y la tabla de movimientos', async () => {
    renderWithProviders(<CashPage />);

    expect(screen.getByText(/Control de Caja y Movimientos/i)).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getAllByText(/\$75[.,]000/)[0]).toBeInTheDocument();
      expect(screen.getAllByText(/\+\$100[.,]000/)[0]).toBeInTheDocument();
      expect(screen.getAllByText(/-\$25[.,]000/)[0]).toBeInTheDocument();
      expect(screen.getByText('Pago de mensajería urgente')).toBeInTheDocument();
      expect(screen.getByText('Base de caja inicial de turno')).toBeInTheDocument();
      expect(screen.getByText('Recibo de caja')).toBeInTheDocument();
    });
  });

  it('es de solo consulta: no ofrece registrar movimientos y remite a recibos y egresos', async () => {
    renderWithProviders(<CashPage />);
    await waitFor(() => expect(screen.getByText('Pago de mensajería urgente')).toBeInTheDocument());
    expect(screen.queryByText(/Registrar Movimiento/i)).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Recibos de caja' })).toHaveAttribute(
      'href',
      '/treasury/receipts',
    );
    expect(screen.getByRole('link', { name: 'Comprobantes de egreso' })).toHaveAttribute(
      'href',
      '/treasury/disbursements',
    );
  });

  it('ordena los movimientos por fecha: más nuevo primero y, al alternar, más viejo primero', async () => {
    renderWithProviders(<CashPage />);
    await waitFor(() =>
      expect(cashApi.fetchCashMovements).toHaveBeenCalledWith(
        expect.objectContaining({ sortOrder: 'desc' }),
      ),
    );
    fireEvent.click(screen.getByRole('button', { name: /Orden por fecha/ }));
    await waitFor(() =>
      expect(cashApi.fetchCashMovements).toHaveBeenLastCalledWith(
        expect.objectContaining({ sortOrder: 'asc' }),
      ),
    );
    expect(screen.getByRole('button', { name: /más viejo primero/ })).toBeInTheDocument();
  });
});
