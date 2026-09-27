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
import { CustomersPage } from '../src/features/customers/pages/CustomersPage';
import { appTheme } from '../src/theme/app-theme';

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

describe('CustomersPage & CustomerFormDialog (Web Integration)', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    vi.spyOn(customersApi, 'fetchCustomers').mockResolvedValue({
      items: mockCustomers,
      total: 2,
      page: 1,
      pageSize: 20,
      totalPages: 1,
    });

    vi.spyOn(customersApi, 'createCustomer').mockImplementation(async (payload) => ({
      id: 'cust-new',
      documentType: payload.documentType || 'CC',
      documentNumber: payload.documentNumber,
      name: payload.name,
      phone: payload.phone || null,
      email: payload.email || null,
      address: payload.address || null,
      isDefault: false,
      isActive: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }));
  });

  it('renderiza la lista de clientes con distintivo de Predeterminado POS', async () => {
    renderWithProviders(<CustomersPage />);

    expect(screen.getByText('Cargando directorio de clientes...')).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText('Directorio de Clientes')).toBeInTheDocument();
      expect(screen.getByText('Consumidor Final (Cuantías Menores)')).toBeInTheDocument();
      expect(screen.getByText('Predeterminado POS')).toBeInTheDocument();
      expect(screen.getByText('Laura Sofía Gómez')).toBeInTheDocument();
      expect(screen.getByText('CC 1020304050')).toBeInTheDocument();
    });
  });

  it('permite abrir el diálogo de registro y crear un nuevo cliente', async () => {
    renderWithProviders(<CustomersPage />);

    await waitFor(() => {
      expect(screen.getByText('+ Nuevo Cliente')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('+ Nuevo Cliente'));

    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText('Registrar Nuevo Cliente')).toBeInTheDocument();

    const docInput = screen.getByPlaceholderText('Ej. 1020304050');
    const nameInput = screen.getByPlaceholderText('Ej. Juan Pérez');

    fireEvent.change(docInput, { target: { value: '987654321' } });
    fireEvent.change(nameInput, { target: { value: 'Mateo Botero' } });

    const submitBtn = screen.getByRole('button', { name: 'Registrar Cliente' });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(customersApi.createCustomer).toHaveBeenCalledWith(
        expect.objectContaining({
          documentNumber: '987654321',
          name: 'Mateo Botero',
        })
      );
    });
  });

  it('deshabilita la opción de inactivar para el cliente predeterminado', async () => {
    renderWithProviders(<CustomersPage />);

    await waitFor(() => {
      expect(screen.getByText('Consumidor Final (Cuantías Menores)')).toBeInTheDocument();
    });

    const rows = screen.getAllByRole('row');
    // Fila 0 es header, fila 1 es Consumidor Final
    const defaultRow = rows[1];
    expect(defaultRow).toHaveTextContent('Consumidor Final');

    // El botón inactivar en la fila del default debe estar deshabilitado
    const deactivateBtn = defaultRow.querySelector('button[disabled]');
    expect(deactivateBtn).not.toBeNull();
    expect(deactivateBtn).toHaveTextContent('Inactivar');
  });
});
