import { ThemeProvider, createTheme } from '@mui/material';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SYSTEM_PERMISSIONS, SYSTEM_ROLES } from '@farmacia/contracts';
import { AuthContext, type AuthContextValue } from '../src/features/auth/context/auth-context';
import * as treasuryApi from '../src/features/treasury/api/treasury.api';
import { TreasuryBankAccountsPage } from '../src/features/treasury/pages/TreasuryBankAccountsPage';

vi.mock('../src/features/treasury/api/treasury.api');

const mockAccounts = [
  {
    id: 'acc-1',
    bankName: 'Bancolombia',
    accountType: 'AHORROS',
    accountNumber: '1234567890',
    name: 'Cuenta Operativa Principal',
    initialBalance: '500000.00',
    currentBalance: '750000.00',
    currency: 'COP',
    isActive: true,
    notes: 'Cuenta principal de ventas',
    createdById: 'user-1',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'acc-2',
    bankName: 'Nequi',
    accountType: 'DIGITAL',
    accountNumber: '3001234567',
    name: 'Billetera Digital Nequi',
    initialBalance: '100000.00',
    currentBalance: '120000.00',
    currency: 'COP',
    isActive: true,
    notes: 'Cobros QR',
    createdById: 'user-1',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
];

const mockSummary = {
  totalBalance: '870000.00',
  activeAccountsCount: 2,
  totalAccountsCount: 2,
  currency: 'COP',
};

const mockMovements = {
  items: [
    {
      id: 'mov-1',
      bankAccountId: 'acc-1',
      movementType: 'DEPOSIT',
      amount: '250000.00',
      balanceBefore: '500000.00',
      balanceAfter: '750000.00',
      concept: 'Consignación ventas POS',
      referenceDocumentType: 'SALE',
      referenceDocumentId: 'VEN-001',
      externalReference: 'TRX-1010',
      movementDate: new Date().toISOString(),
      createdById: 'user-1',
      createdAt: new Date().toISOString(),
    },
  ],
  total: 1,
};

const renderWithProviders = (
  permissions: string[] = [
    SYSTEM_PERMISSIONS.TREASURY_READ,
    SYSTEM_PERMISSIONS.TREASURY_MANAGE,
  ],
) => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

  const authValue: AuthContextValue = {
    user: {
      id: 'user-1',
      username: 'admin',
      roles: [SYSTEM_ROLES.ADMIN],
      permissions,
    },
    isAuthenticated: true,
    isLoading: false,
    login: vi.fn(),
    logout: vi.fn(),
  };

  const theme = createTheme();

  return render(
    <ThemeProvider theme={theme}>
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <AuthContext.Provider value={authValue}>
            <TreasuryBankAccountsPage />
          </AuthContext.Provider>
        </MemoryRouter>
      </QueryClientProvider>
    </ThemeProvider>,
  );
};

describe('TreasuryBankAccountsPage (Slice 11.4 Frontend)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(treasuryApi.getBankAccounts).mockResolvedValue(mockAccounts as any);
    vi.mocked(treasuryApi.getBankAccountSummary).mockResolvedValue(mockSummary as any);
    vi.mocked(treasuryApi.getBankMovements).mockResolvedValue(mockMovements as any);
  });

  it('muestra mensaje de advertencia si el usuario no tiene permisos de lectura', async () => {
    renderWithProviders([]);
    expect(
      await screen.findByText(/No tienes permisos para consultar la tesorería/i),
    ).toBeInTheDocument();
  });

  it('renderiza el título, las tarjetas de métricas y las tarjetas de cuentas bancarias', async () => {
    renderWithProviders();

    expect(await screen.findByText('Tesorería y Cuentas Bancarias')).toBeInTheDocument();
    expect(screen.getByText('Saldo Total Disponible en Bancos')).toBeInTheDocument();
    expect(await screen.findByText(/870\.000/i)).toBeInTheDocument();
    const countBadges = await screen.findAllByText('2 Cuentas');
    expect(countBadges.length).toBeGreaterThanOrEqual(1);

    expect(screen.getByText('Bancolombia')).toBeInTheDocument();
    expect(screen.getByText('Nequi')).toBeInTheDocument();
    expect(screen.getByText('Cuenta Operativa Principal')).toBeInTheDocument();
    expect(screen.getByText('Billetera Digital Nequi')).toBeInTheDocument();
  });

  it('muestra la sección de movimientos de la cuenta seleccionada', async () => {
    renderWithProviders();

    expect(
      await screen.findByText(/Movimientos: Cuenta Operativa Principal/i),
    ).toBeInTheDocument();
    expect(await screen.findByText('Consignación ventas POS')).toBeInTheDocument();
    expect(screen.getByText('TRX-1010')).toBeInTheDocument();
    expect(screen.getByText('+$250.000')).toBeInTheDocument();
  });

  it('permite abrir el diálogo de nueva cuenta bancaria y crearla', async () => {
    vi.mocked(treasuryApi.createBankAccount).mockResolvedValue({
      id: 'acc-3',
      bankName: 'Davivienda',
      accountType: 'CORRIENTE',
      accountNumber: '9988776655',
      name: 'Cuenta Pagos',
      initialBalance: '0.00',
      currentBalance: '0.00',
      currency: 'COP',
      isActive: true,
      notes: null,
      createdById: 'user-1',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    renderWithProviders();

    const newBtn = await screen.findByTestId('new-bank-account-btn');
    fireEvent.click(newBtn);

    expect(await screen.findByRole('heading', { name: 'Nueva Cuenta Bancaria' })).toBeInTheDocument();

    const bankInput = screen.getByLabelText(/Banco o Entidad/i);
    fireEvent.change(bankInput, { target: { value: 'Davivienda' } });

    const numberInput = screen.getByLabelText(/Número de Cuenta/i);
    fireEvent.change(numberInput, { target: { value: '9988776655' } });

    const nameInput = screen.getByLabelText(/Nombre Descriptivo/i);
    fireEvent.change(nameInput, { target: { value: 'Cuenta Pagos' } });

    const submitBtn = screen.getByTestId('submit-bank-account-btn');
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(treasuryApi.createBankAccount).toHaveBeenCalledWith(
        expect.objectContaining({
          bankName: 'Davivienda',
          accountNumber: '9988776655',
          name: 'Cuenta Pagos',
        }),
      );
    });
  });

  it('permite abrir el diálogo de registro de movimiento en una cuenta', async () => {
    vi.mocked(treasuryApi.createBankMovement).mockResolvedValue({
      id: 'mov-2',
      bankAccountId: 'acc-1',
      movementType: 'DEPOSIT',
      amount: '50000.00',
      balanceBefore: '750000.00',
      balanceAfter: '800000.00',
      concept: 'Depósito manual',
      referenceDocumentType: null,
      referenceDocumentId: null,
      externalReference: null,
      movementDate: new Date().toISOString(),
      createdById: 'user-1',
      createdAt: new Date().toISOString(),
    });

    renderWithProviders();

    const movBtn = await screen.findByTestId('new-movement-btn-acc-1');
    fireEvent.click(movBtn);

    expect(await screen.findByRole('heading', { name: /Registrar Movimiento en Bancolombia/i })).toBeInTheDocument();

    const amountInput = screen.getByLabelText(/Importe/i);
    fireEvent.change(amountInput, { target: { value: '50000.00' } });

    const conceptInput = screen.getByLabelText(/Concepto/i);
    fireEvent.change(conceptInput, { target: { value: 'Depósito manual' } });

    const submitBtn = screen.getByTestId('submit-movement-btn');
    fireEvent.click(submitBtn);

    const confirmBtn = await screen.findByRole('button', { name: 'Confirmar y Asentar' });
    fireEvent.click(confirmBtn);

    await waitFor(() => {
      expect(treasuryApi.createBankMovement).toHaveBeenCalledWith(
        'acc-1',
        expect.objectContaining({
          movementType: 'DEPOSIT',
          amount: '50000.00',
          concept: 'Depósito manual',
        }),
      );
    });
  });
});
