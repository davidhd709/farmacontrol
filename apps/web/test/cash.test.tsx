import { ThemeProvider } from '@mui/material';
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
    permissions: [
      SYSTEM_PERMISSIONS.CASH_READ,
      SYSTEM_PERMISSIONS.CASH_MOVEMENTS,
    ],
  },
  roles: [SYSTEM_ROLES.CAJERO],
  permissions: [
    SYSTEM_PERMISSIONS.CASH_READ,
    SYSTEM_PERMISSIONS.CASH_MOVEMENTS,
  ],
  isAuthenticated: true,
  isLoading: false,
  error: null,
  login: vi.fn(),
  logout: vi.fn(),
  refreshSession: vi.fn(),
};

const renderWithProviders = (ui: React.ReactElement) => {
  return render(
    <ThemeProvider theme={appTheme}>
      <AuthContext.Provider value={mockAuthContext}>
        <MemoryRouter>{ui}</MemoryRouter>
      </AuthContext.Provider>
    </ThemeProvider>
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
    vi.spyOn(cashApi, 'createCashMovement').mockResolvedValue({
      id: 'mov-3',
      movementType: 'INGRESO_MANUAL',
      amount: 50000,
      paymentMethod: 'EFECTIVO',
      reason: 'Aporte de cambio adicional',
      balanceAfter: 125000,
      createdAt: '2026-09-26T16:00:00.000Z',
      createdByUserId: 'user-cajero',
      createdByUsername: 'cajero_1',
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
    });
  });

  it('permite abrir el modal de registro de movimiento y registrar una entrada de efectivo exitosa', async () => {
    renderWithProviders(<CashPage />);

    await waitFor(() => {
      expect(screen.getByText('+ Registrar Movimiento')).toBeInTheDocument();
    });

    const openBtn = screen.getByText('+ Registrar Movimiento');
    fireEvent.click(openBtn);

    expect(screen.getByText('Registrar Movimiento de Caja')).toBeInTheDocument();

    const amountInput = screen.getByLabelText(/Monto/i);
    const reasonInput = screen.getByLabelText(/Motivo \/ Justificación/i);

    fireEvent.change(amountInput, { target: { value: '50000' } });
    fireEvent.change(reasonInput, { target: { value: 'Aporte de cambio adicional' } });

    const confirmBtn = screen.getByRole('button', { name: 'Confirmar Movimiento' });
    expect(confirmBtn).toBeEnabled();

    fireEvent.click(confirmBtn);

    const finalConfirmBtn = await screen.findByRole('button', { name: 'Confirmar Ingreso' });
    fireEvent.click(finalConfirmBtn);

    await waitFor(() => {
      expect(cashApi.createCashMovement).toHaveBeenCalledWith(
        expect.objectContaining({
          movementType: 'INGRESO_MANUAL',
          amount: 50000,
          paymentMethod: 'EFECTIVO',
          reason: 'Aporte de cambio adicional',
        })
      );
    });
  });

  it('muestra advertencia y bloquea el botón cuando un egreso en efectivo supera el saldo disponible', async () => {
    renderWithProviders(<CashPage />);

    await waitFor(() => {
      expect(screen.getByText('+ Registrar Movimiento')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('+ Registrar Movimiento'));

    // Cambiar a Egreso Manual
    const egresoRadio = screen.getByLabelText(/- Egreso Manual/i);
    fireEvent.click(egresoRadio);

    const amountInput = screen.getByLabelText(/Monto/i);
    const reasonInput = screen.getByLabelText(/Motivo \/ Justificación/i);

    // Intentar retirar $100.000 cuando solo hay $75.000
    fireEvent.change(amountInput, { target: { value: '100000' } });
    fireEvent.change(reasonInput, { target: { value: 'Retiro no permitido' } });

    expect(
      screen.getByText(/El egreso supera el saldo actual disponible en caja física/i)
    ).toBeInTheDocument();

    const confirmBtn = screen.getByRole('button', { name: 'Confirmar Movimiento' });
    expect(confirmBtn).toBeDisabled();
  });
});
