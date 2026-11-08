import { ThemeProvider } from '@mui/material';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ThirdPartyDto } from '@farmacia/contracts';
import * as thirdPartiesApi from '../src/features/third-parties/api/third-parties.api';
import { ThirdPartiesPage } from '../src/features/third-parties/pages/ThirdPartiesPage';
import { ThirdPartyAutocomplete } from '../src/features/third-parties/components/ThirdPartyAutocomplete';
import { ThirdPartyFormDialog } from '../src/features/third-parties/components/ThirdPartyFormDialog';
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

describe('ThirdPartyFormDialog — Departamentos y Municipios de Colombia (DANE DIVIPOLA)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  const renderFormDialog = (thirdPartyToEdit: ThirdPartyDto | null = null) => {
    const onClose = vi.fn();
    const onSaved = vi.fn();
    const view = render(
      <ThemeProvider theme={appTheme}>
        <ThirdPartyFormDialog
          open
          onClose={onClose}
          onSaved={onSaved}
          thirdPartyToEdit={thirdPartyToEdit}
        />
      </ThemeProvider>
    );
    return { ...view, onClose, onSaved };
  };

  it('muestra Departamento antes que Ciudad / Municipio y mantiene Ciudad / Municipio deshabilitado hasta elegir departamento', () => {
    renderFormDialog();

    const deptInput = screen.getByLabelText('Departamento') as HTMLInputElement;
    const cityInput = screen.getByLabelText('Ciudad / Municipio') as HTMLInputElement;

    expect(deptInput).toBeInTheDocument();
    expect(cityInput).toBeInTheDocument();
    expect(cityInput).toBeDisabled();

    // Verificar orden en el DOM: Departamento aparece antes que Ciudad / Municipio
    expect(
      deptInput.compareDocumentPosition(cityInput) & Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy();
  });

  it('lista los departamentos oficiales con tildes (Sucre, Córdoba, Bogotá, D. C.), permite seleccionar Sucre -> Sincelejo y limpia el municipio al cambiar a Córdoba', async () => {
    renderFormDialog();

    const deptInput = screen.getByLabelText('Departamento') as HTMLInputElement;
    const cityInput = screen.getByLabelText('Ciudad / Municipio') as HTMLInputElement;

    // 1. Abrir lista de departamentos
    fireEvent.focus(deptInput);
    fireEvent.mouseDown(deptInput);

    expect(await screen.findByRole('option', { name: 'Sucre' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Córdoba' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Bogotá, D. C.' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Antioquia' })).toBeInTheDocument();

    // 2. Seleccionar Sucre
    fireEvent.click(screen.getByRole('option', { name: 'Sucre' }));
    expect(deptInput).toHaveValue('Sucre');
    expect(cityInput).not.toBeDisabled();

    // 3. Seleccionar Sincelejo dentro de Sucre
    fireEvent.focus(cityInput);
    fireEvent.mouseDown(cityInput);
    const sincelejoOption = await screen.findByRole('option', { name: 'Sincelejo' });
    expect(sincelejoOption).toBeInTheDocument();
    fireEvent.click(sincelejoOption);
    expect(cityInput).toHaveValue('Sincelejo');

    // 4. Cambiar de departamento a Córdoba -> debe limpiar Sincelejo y mostrar municipios de Córdoba
    fireEvent.focus(deptInput);
    fireEvent.mouseDown(deptInput);
    fireEvent.click(await screen.findByRole('option', { name: 'Córdoba' }));

    expect(deptInput).toHaveValue('Córdoba');
    expect(cityInput).toHaveValue('');

    // 5. Verificar que en Córdoba aparecen Montería, Cereté, Sahagún, Planeta Rica y NO aparece Sincelejo
    fireEvent.focus(cityInput);
    fireEvent.mouseDown(cityInput);
    expect(await screen.findByRole('option', { name: 'Montería' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Cereté' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Sahagún' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Planeta Rica' })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: 'Sincelejo' })).toBeNull();
  });

  it('crea un tercero enviando departamento, municipio y códigos DIVIPOLA con ceros a la izquierda sin consultar servicios externos', async () => {
    const createSpy = vi.spyOn(thirdPartiesApi, 'createThirdParty').mockResolvedValue({
      ...mockThirdParties[0],
      id: 'tp-new',
      department: 'Antioquia',
      city: 'Medellín',
      departmentCode: '05',
      municipalityCode: '05001',
    });

    const { onSaved } = renderFormDialog();

    fireEvent.change(screen.getByLabelText(/Número de Documento/i), {
      target: { value: '1037654321' },
    });
    fireEvent.change(screen.getByLabelText(/Nombre Completo/i), {
      target: { value: 'Laura Restrepo Mejía' },
    });
    expect(screen.getByRole('checkbox', { name: /Cliente/i })).toBeChecked();

    const deptInput = screen.getByLabelText('Departamento');
    fireEvent.focus(deptInput);
    fireEvent.mouseDown(deptInput);
    fireEvent.click(await screen.findByRole('option', { name: 'Antioquia' }));

    const cityInput = screen.getByLabelText('Ciudad / Municipio');
    fireEvent.focus(cityInput);
    fireEvent.mouseDown(cityInput);
    fireEvent.click(await screen.findByRole('option', { name: 'Medellín' }));

    fireEvent.click(screen.getByRole('button', { name: /Registrar Tercero/i }));

    await waitFor(() => {
      expect(createSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          documentNumber: '1037654321',
          name: 'Laura Restrepo Mejía',
          department: 'Antioquia',
          city: 'Medellín',
          departmentCode: '05',
          municipalityCode: '05001',
        })
      );
      expect(onSaved).toHaveBeenCalled();
    });
  });

  it('al editar un tercero existente preselecciona el departamento y el municipio cuando se identifican con certeza', async () => {
    renderFormDialog(mockThirdParties[0]); // Córdoba / Montería

    const deptInput = screen.getByLabelText('Departamento') as HTMLInputElement;
    const cityInput = screen.getByLabelText('Ciudad / Municipio') as HTMLInputElement;

    expect(deptInput).toHaveValue('Córdoba');
    expect(cityInput).not.toBeDisabled();
    expect(cityInput).toHaveValue('Montería');
  });

  it('al editar un tercero con municipio ambiguo sin departamento (ej. Buenavista) no asigna automáticamente un departamento dudoso y conserva el dato original', async () => {
    const ambiguousThirdParty: ThirdPartyDto = {
      ...mockThirdParties[1],
      id: 'tp-ambiguous',
      city: 'Buenavista',
      department: null,
    };

    const updateSpy = vi
      .spyOn(thirdPartiesApi, 'updateThirdParty')
      .mockResolvedValue(ambiguousThirdParty);

    renderFormDialog(ambiguousThirdParty);

    const deptInput = screen.getByLabelText('Departamento') as HTMLInputElement;
    const cityInput = screen.getByLabelText('Ciudad / Municipio') as HTMLInputElement;

    expect(deptInput).toHaveValue('');
    expect(cityInput).toBeDisabled();
    expect(cityInput).toHaveValue('');
    expect(
      screen.getByText(/Ubicación registrada actualmente:/i)
    ).toBeInTheDocument();

    // Si se guarda sin tocar la ubicación, conserva el valor original sin corromperlo
    fireEvent.click(screen.getByRole('button', { name: /Guardar Cambios/i }));

    await waitFor(() => {
      expect(updateSpy).toHaveBeenCalledWith(
        'tp-ambiguous',
        expect.objectContaining({
          city: 'Buenavista',
          department: null,
        })
      );
    });
  });
});
