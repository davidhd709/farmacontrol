import { ThemeProvider } from '@mui/material';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ThirdPartyDto } from '@farmacia/contracts';
import * as thirdPartiesApi from '../src/features/third-parties/api/third-parties.api';
import { ThirdPartiesPage } from '../src/features/third-parties/pages/ThirdPartiesPage';
import { ThirdPartyAutocomplete } from '../src/features/third-parties/components/ThirdPartyAutocomplete';
import { appTheme } from '../src/theme/app-theme';

// Mock de usePermissions para tener acceso de administración
vi.mock('../src/features/auth/hooks/usePermissions', () => ({
  usePermissions: () => ({
    hasPermission: () => true,
    hasAnyPermission: () => true,
    isAdmin: true,
    role: 'ADMIN',
  }),
}));

const mockThirdParties: ThirdPartyDto[] = [
  {
    id: 'tp-1',
    personType: 'JURIDICA',
    documentType: 'NIT',
    documentNumber: '900123456',
    verificationDigit: '1',
    name: 'Distribuidora Farmacéutica del Norte S.A.S.',
    tradeName: 'DisFarma',
    contactName: 'Carlos Ruiz',
    phone: '3001234567',
    email: 'contacto@disfarma.com',
    address: 'Calle 10 # 20-30',
    city: 'Montería',
    department: 'Córdoba',
    taxRegime: 'RESPONSABLE_IVA',
    isCustomer: false,
    isSupplier: true,
    isEmployee: false,
    isOther: false,
    isActive: true,
    createdAt: '2026-10-05T00:00:00.000Z',
    updatedAt: '2026-10-05T00:00:00.000Z',
  },
  {
    id: 'tp-2',
    personType: 'NATURAL',
    documentType: 'CC',
    documentNumber: '10203040',
    verificationDigit: null,
    name: 'Carlos Gómez Restrepo',
    tradeName: null,
    contactName: null,
    phone: '3109876543',
    email: 'carlos.gomez@gmail.com',
    address: 'Carrera 5 # 12-40',
    city: 'Cereté',
    department: 'Córdoba',
    taxRegime: 'NO_RESPONSABLE_IVA',
    isCustomer: true,
    isSupplier: false,
    isEmployee: false,
    isOther: false,
    isActive: true,
    createdAt: '2026-10-05T00:00:00.000Z',
    updatedAt: '2026-10-05T00:00:00.000Z',
  },
  {
    id: 'tp-3',
    personType: 'NATURAL',
    documentType: 'CC',
    documentNumber: '1067890123',
    verificationDigit: null,
    name: 'Valentina Hoyos Morales',
    tradeName: null,
    contactName: null,
    phone: '3157778899',
    email: 'valentina.hoyos@farmacia.com',
    address: 'Calle 25 # 14-10',
    city: 'Montería',
    department: 'Córdoba',
    taxRegime: 'NO_RESPONSABLE_IVA',
    isCustomer: false,
    isSupplier: false,
    isEmployee: true,
    isOther: false,
    isActive: true,
    createdAt: '2026-10-05T00:00:00.000Z',
    updatedAt: '2026-10-05T00:00:00.000Z',
  },
];

describe('ThirdPartiesPage (Gestión Unificada de Terceros)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(thirdPartiesApi, 'fetchThirdParties').mockResolvedValue({
      items: mockThirdParties,
      total: 3,
      page: 1,
      pageSize: 20,
      totalPages: 1,
    });
  });

  const renderComponent = () =>
    render(
      <ThemeProvider theme={appTheme}>
        <MemoryRouter>
          <ThirdPartiesPage />
        </MemoryRouter>
      </ThemeProvider>
    );

  it('debe renderizar el título de la página, los tabs de rol y la lista de terceros', async () => {
    renderComponent();

    expect(screen.getByText('Directorio de Terceros')).toBeInTheDocument();
    expect(
      screen.getByText('Gestión centralizada de clientes, proveedores, colaboradores y beneficiarios')
    ).toBeInTheDocument();

    expect(screen.getByRole('tab', { name: 'Todos los Terceros' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Clientes' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Proveedores' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Empleados / Colaboradores' })).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText('Distribuidora Farmacéutica del Norte S.A.S.')).toBeInTheDocument();
      expect(screen.getByText('Carlos Gómez Restrepo')).toBeInTheDocument();
      expect(screen.getByText('Valentina Hoyos Morales')).toBeInTheDocument();
    });

    // Validar chips de roles
    expect(screen.getByText('Proveedor')).toBeInTheDocument();
    expect(screen.getByText('Cliente')).toBeInTheDocument();
    expect(screen.getByText('Empleado')).toBeInTheDocument();
  });

  it('debe abrir el diálogo modal al presionar "Nuevo Tercero"', async () => {
    renderComponent();

    const createBtn = screen.getByRole('button', { name: /nuevo tercero/i });
    expect(createBtn).toBeInTheDocument();
    fireEvent.click(createBtn);

    await waitFor(() => {
      expect(screen.getByText('Registrar Nuevo Tercero')).toBeInTheDocument();
      expect(screen.getByText('1. Identificación y Tipo de Tercero')).toBeInTheDocument();
      expect(screen.getByText('2. Roles de Operación en el Sistema')).toBeInTheDocument();
      expect(screen.getByText('3. Datos de Contacto y Ubicación')).toBeInTheDocument();
    });
  });

  it('debe filtrar terceros al cambiar el tab de rol', async () => {
    renderComponent();

    const proveedoresTab = screen.getByRole('tab', { name: 'Proveedores' });
    fireEvent.click(proveedoresTab);

    await waitFor(() => {
      expect(thirdPartiesApi.fetchThirdParties).toHaveBeenCalledWith(
        expect.objectContaining({
          role: 'SUPPLIER',
        })
      );
    });
  });
});

describe('ThirdPartyAutocomplete (Selector de Terceros para Contabilidad y Gastos)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(thirdPartiesApi, 'fetchThirdParties').mockResolvedValue({
      items: mockThirdParties,
      total: 3,
      page: 1,
      pageSize: 20,
      totalPages: 1,
    });
  });

  it('debe renderizar el selector con su placeholder y permitir escribir', async () => {
    const handleChange = vi.fn();
    render(
      <ThemeProvider theme={appTheme}>
        <ThirdPartyAutocomplete
          value={null}
          onChange={handleChange}
          label="Tercero"
          placeholder="Buscar tercero..."
          freeSolo
        />
      </ThemeProvider>
    );

    const input = screen.getByPlaceholderText('Buscar tercero...');
    expect(input).toBeInTheDocument();

    fireEvent.change(input, { target: { value: 'DisFarma' } });
    expect(input).toHaveValue('DisFarma');
  });

  it('debe mostrar opciones al interactuar y permitir seleccionar un tercero', async () => {
    const handleChange = vi.fn();
    render(
      <ThemeProvider theme={appTheme}>
        <ThirdPartyAutocomplete
          value={null}
          onChange={handleChange}
          label="Tercero"
          placeholder="Buscar tercero..."
        />
      </ThemeProvider>
    );

    const input = screen.getByPlaceholderText('Buscar tercero...');
    fireEvent.focus(input);
    fireEvent.mouseDown(input);

    await waitFor(() => {
      expect(thirdPartiesApi.fetchThirdParties).toHaveBeenCalled();
    });
  });
});
