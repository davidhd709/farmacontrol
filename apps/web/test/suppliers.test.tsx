import { ThemeProvider } from '@mui/material';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SYSTEM_PERMISSIONS, SYSTEM_ROLES, type SupplierDto } from '@farmacia/contracts';
import { AuthContext, type AuthContextValue } from '../src/features/auth/context/auth-context';
import * as suppliersApi from '../src/features/suppliers/api/suppliers.api';
import { SuppliersPage } from '../src/features/suppliers/pages/SuppliersPage';
import { appTheme } from '../src/theme/app-theme';

const mockSuppliers: SupplierDto[] = [
  {
    id: 'sup-1',
    taxId: '900123456-1',
    name: 'Distribuidora Farmacéutica del Valle',
    contactName: 'Carlos Gómez',
    phone: '3001234567',
    email: 'ventas@farmavalle.com',
    address: 'Calle 10 # 45-20',
    isActive: true,
    createdAt: '2026-09-01T10:00:00.000Z',
    updatedAt: '2026-09-01T10:00:00.000Z',
  },
  {
    id: 'sup-2',
    taxId: '800987654-2',
    name: 'Laboratorios Genfar S.A.',
    contactName: 'Ana Ruiz',
    phone: '6012223333',
    email: 'contacto@genfar.com',
    address: 'Av. Las Américas # 68-10',
    isActive: true,
    createdAt: '2026-09-02T10:00:00.000Z',
    updatedAt: '2026-09-02T10:00:00.000Z',
  },
];

function createMockAuthContext(permissions: string[] = []): AuthContextValue {
  return {
    user: {
      id: 'usr-1',
      username: 'admin_farmacia',
      isActive: true,
      roles: [SYSTEM_ROLES.ADMIN],
      permissions,
    },
    status: 'authenticated',
    login: vi.fn(),
    logout: vi.fn(),
    refreshSession: vi.fn(),
  };
}

function renderSuppliersPage(permissions: string[] = [
  SYSTEM_PERMISSIONS.SUPPLIERS_READ,
  SYSTEM_PERMISSIONS.SUPPLIERS_MANAGE,
]) {
  const authValue = createMockAuthContext(permissions);
  return render(
    <ThemeProvider theme={appTheme}>
      <MemoryRouter>
        <AuthContext.Provider value={authValue}>
          <SuppliersPage />
        </AuthContext.Provider>
      </MemoryRouter>
    </ThemeProvider>
  );
}

describe('SuppliersPage (UX-19 Frontend)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(suppliersApi, 'fetchSuppliers').mockResolvedValue({
      items: mockSuppliers,
      total: mockSuppliers.length,
      page: 1,
      pageSize: 20,
      totalPages: 1,
    });
    vi.spyOn(suppliersApi, 'createSupplier').mockResolvedValue({
      id: 'sup-new',
      taxId: '900000000-0',
      name: 'Proveedor Nuevo',
      contactName: null,
      phone: null,
      email: null,
      address: null,
      isActive: true,
      createdAt: '2026-09-26T10:00:00.000Z',
      updatedAt: '2026-09-26T10:00:00.000Z',
    });
  });

  it('renderiza la lista de proveedores correctamente', async () => {
    renderSuppliersPage();

    await waitFor(() => {
      expect(screen.getByText('Directorio de Proveedores')).toBeInTheDocument();
      expect(screen.getByText('Distribuidora Farmacéutica del Valle')).toBeInTheDocument();
      expect(screen.getByText('Laboratorios Genfar S.A.')).toBeInTheDocument();
      expect(screen.getByText('900123456-1')).toBeInTheDocument();
    });
  });

  it('abre el modal de nuevo proveedor y valida campos obligatorios', async () => {
    const user = userEvent.setup();
    renderSuppliersPage();

    await waitFor(() => {
      expect(screen.getByText('+ Nuevo Proveedor')).toBeInTheDocument();
    });

    await user.click(screen.getByText('+ Nuevo Proveedor'));

    expect(screen.getByText('Registrar Nuevo Proveedor')).toBeInTheDocument();

    const saveBtn = screen.getByRole('button', { name: 'Registrar Proveedor' });
    await user.click(saveBtn);

    // Debe seguir en el diálogo y no llamar al api de creación si está vacío
    expect(suppliersApi.createSupplier).not.toHaveBeenCalled();
  });

  it('permite registrar un nuevo proveedor exitosamente', async () => {
    const user = userEvent.setup();
    vi.spyOn(suppliersApi, 'createSupplier').mockResolvedValueOnce({
      id: 'sup-3',
      taxId: '901000111-5',
      name: 'Droguerías Aliadas de Colombia',
      contactName: 'Pedro López',
      phone: '3159998888',
      email: 'pedro@aliadas.com',
      address: 'Zona Industrial',
      isActive: true,
      createdAt: '2026-09-26T10:00:00.000Z',
      updatedAt: '2026-09-26T10:00:00.000Z',
    });

    renderSuppliersPage();

    await waitFor(() => {
      expect(screen.getByText('+ Nuevo Proveedor')).toBeInTheDocument();
    });

    await user.click(screen.getByText('+ Nuevo Proveedor'));

    const taxIdInput = screen.getByPlaceholderText('Ej. 900123456-1');
    const nameInput = screen.getByPlaceholderText('Ej. Distribuidora Farmacéutica del Valle S.A.S.');

    await user.type(taxIdInput, '901000111-5');
    await user.type(nameInput, 'Droguerías Aliadas de Colombia');

    const submitBtn = screen.getByRole('button', { name: 'Registrar Proveedor' });
    await user.click(submitBtn);

    await waitFor(() => {
      expect(suppliersApi.createSupplier).toHaveBeenCalledWith(
        expect.objectContaining({
          taxId: '901000111-5',
          name: 'Droguerías Aliadas de Colombia',
        })
      );
    });
  });

  it('muestra diálogo de confirmación y permite inactivar al proveedor', async () => {
    const user = userEvent.setup();
    vi.spyOn(suppliersApi, 'deactivateSupplier').mockResolvedValueOnce({
      ...mockSuppliers[0],
      isActive: false,
    });

    renderSuppliersPage();

    await waitFor(() => {
      expect(screen.getAllByRole('button', { name: 'Inactivar' })).toHaveLength(2);
    });

    // Clic en el primer botón de Inactivar
    await user.click(screen.getAllByRole('button', { name: 'Inactivar' })[0]);

    expect(screen.getByText('Confirmar Inactivación de Proveedor')).toBeInTheDocument();

    const confirmBtn = screen.getByRole('button', { name: 'Confirmar Inactivación' });
    await user.click(confirmBtn);

    await waitFor(() => {
      expect(suppliersApi.deactivateSupplier).toHaveBeenCalledWith('sup-1');
    });
  });
});
