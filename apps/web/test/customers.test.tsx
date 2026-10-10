import { ThemeProvider } from '@mui/material';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  SYSTEM_PERMISSIONS,
  SYSTEM_ROLES,
  type CustomerDto,
} from '@farmacia/contracts';
import { AuthContext, type AuthContextValue } from '../src/features/auth/context/auth-context';
import * as customersApi from '../src/features/customers/api/customers.api';
import { CustomerFormDialog } from '../src/features/customers/components/CustomerFormDialog';
import { appTheme } from '../src/theme/app-theme';

// Terceros unificado: la pantalla de clientes se retiró; el POS conserva el registro rápido
const mockCustomers: CustomerDto[] = [
  {
    id: 'cust-default',
    documentType: 'CC',
    documentNumber: '222222222222',
    name: 'Consumidor Final (Cuantías Menores)',
    phone: null,
    email: null,
    address: null,
    isDefault: true,
    isActive: true,
    createdAt: '2026-09-26T10:00:00.000Z',
    updatedAt: '2026-09-26T10:00:00.000Z',
  },
  {
    id: 'cust-1',
    documentType: 'CC',
    documentNumber: '1020304050',
    name: 'Laura Sofía Gómez',
    phone: '3109876543',
    email: 'laura.gomez@test.com',
    address: 'Carrera 15 # 45-20',
    isDefault: false,
    isActive: true,
    createdAt: '2026-09-26T11:00:00.000Z',
    updatedAt: '2026-09-26T11:00:00.000Z',
  },
];

const mockAuthContext: AuthContextValue = {
  user: {
    id: 'user-cajero',
    username: 'cajero_1',
    isActive: true,
    roles: [SYSTEM_ROLES.CAJERO],
    permissions: [
      SYSTEM_PERMISSIONS.CUSTOMERS_READ,
      SYSTEM_PERMISSIONS.CUSTOMERS_MANAGE,
    ],
  },
  roles: [SYSTEM_ROLES.CAJERO],
  permissions: [
    SYSTEM_PERMISSIONS.CUSTOMERS_READ,
    SYSTEM_PERMISSIONS.CUSTOMERS_MANAGE,
  ],
  isAuthenticated: true,
  isLoading: false,
  login: vi.fn(),
  logout: vi.fn(),
  hasPermission: (perm: string) =>
    [
      SYSTEM_PERMISSIONS.CUSTOMERS_READ,
      SYSTEM_PERMISSIONS.CUSTOMERS_MANAGE,
    ].includes(perm as any),
  hasAnyPermission: () => true,
  hasAllPermissions: () => true,
  hasRole: () => true,
};

function renderWithProviders(ui: React.ReactElement) {
  return render(
    <MemoryRouter>
      <ThemeProvider theme={appTheme}>
        <AuthContext.Provider value={mockAuthContext}>{ui}</AuthContext.Provider>
      </ThemeProvider>
    </MemoryRouter>
  );
}

describe('CustomerFormDialog del POS (registro rápido de cliente)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(customersApi, 'createCustomer').mockImplementation(async (payload) => ({
      ...mockCustomers[1],
      id: 'cust-new',
      documentType: payload.documentType || 'CC',
      documentNumber: payload.documentNumber,
      name: payload.name,
      isDefault: false,
    }));
  });

  it('registra el cliente y lo devuelve al POS', async () => {
    const onCustomerCreated = vi.fn();
    renderWithProviders(
      <CustomerFormDialog open onClose={vi.fn()} onCustomerCreated={onCustomerCreated} />,
    );

    expect(screen.getByText('Registrar Nuevo Cliente')).toBeInTheDocument();
    fireEvent.change(screen.getByPlaceholderText('Ej. 1020304050'), { target: { value: '987654321' } });
    fireEvent.change(screen.getByPlaceholderText('Ej. Juan Pérez'), { target: { value: 'Mateo Botero' } });
    fireEvent.click(screen.getByRole('button', { name: 'Registrar Cliente' }));

    await waitFor(() => {
      expect(customersApi.createCustomer).toHaveBeenCalledWith(
        expect.objectContaining({ documentNumber: '987654321', name: 'Mateo Botero' }),
      );
    });
    await waitFor(() =>
      expect(onCustomerCreated).toHaveBeenCalledWith(expect.objectContaining({ id: 'cust-new' })),
    );
  });
});
