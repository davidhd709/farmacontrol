import { ThemeProvider } from '@mui/material';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SYSTEM_PERMISSIONS, type ThirdPartyDto } from '@farmacia/contracts';
import * as thirdPartiesApi from '../src/features/third-parties/api/third-parties.api';
import { ThirdPartiesPage } from '../src/features/third-parties/pages/ThirdPartiesPage';
import { AppSidebar } from '../src/components/layout/AppSidebar';
import { appTheme } from '../src/theme/app-theme';
import { withAuth } from './support-auth';

const base = {
  personType: 'NATURAL',
  documentType: 'CC',
  verificationDigit: null,
  tradeName: null,
  contactName: null,
  phone: null,
  email: null,
  address: null,
  city: null,
  department: null,
  taxRegime: 'NO_RESPONSABLE_IVA',
  isEmployee: false,
  isOther: false,
  isActive: true,
  createdAt: '2026-10-05T00:00:00.000Z',
  updatedAt: '2026-10-05T00:00:00.000Z',
} as const;
const customer = {
  ...base,
  id: 'tp-c',
  documentNumber: '10203040',
  name: 'Carlos Gómez',
  isCustomer: true,
  isSupplier: false,
} as ThirdPartyDto;
const supplier = {
  ...base,
  id: 'tp-s',
  documentType: 'NIT',
  documentNumber: '900123456',
  name: 'Droguería Mayorista',
  isCustomer: false,
  isSupplier: true,
  supplierId: 'sup-1',
} as ThirdPartyDto;

const CARTERA = [
  SYSTEM_PERMISSIONS.CUSTOMERS_READ,
  SYSTEM_PERMISSIONS.CUSTOMERS_CREATE,
  SYSTEM_PERMISSIONS.CUSTOMERS_MANAGE,
];
const COMPRAS = [SYSTEM_PERMISSIONS.SUPPLIERS_READ, SYSTEM_PERMISSIONS.SUPPLIERS_MANAGE];
const CAJERO = [SYSTEM_PERMISSIONS.CUSTOMERS_READ, SYSTEM_PERMISSIONS.CUSTOMERS_CREATE];

function renderPage(permissions: string[]) {
  return render(
    <ThemeProvider theme={appTheme}>
      <MemoryRouter>{withAuth(<ThirdPartiesPage />, permissions)}</MemoryRouter>
    </ThemeProvider>,
  );
}

describe('Directorio de terceros por rol (2026-11-03)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('cartera ve solo clientes, edita y crea clientes, sin desactivar', async () => {
    const list = vi.spyOn(thirdPartiesApi, 'fetchThirdParties').mockResolvedValue({
      items: [customer],
      total: 1,
      page: 1,
      pageSize: 20,
      totalPages: 1,
    });
    renderPage(CARTERA);
    expect(await screen.findByText('Carlos Gómez')).toBeInTheDocument();
    await waitFor(() =>
      expect(list).toHaveBeenCalledWith(expect.objectContaining({ role: 'CUSTOMER' })),
    );
    expect(screen.getAllByRole('tab').map((tab) => tab.textContent)).toEqual(['Clientes']);
    expect(screen.getByRole('button', { name: 'Editar Tercero' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Desactivar Tercero' })).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Nuevo Tercero' }));
    const dialog = await screen.findByRole('dialog');
    const role = (name: RegExp) => within(dialog).getByRole('checkbox', { name });
    expect(role(/Cliente/)).toBeChecked();
    expect(role(/Cliente/)).toBeDisabled();
    expect(role(/Proveedor/)).not.toBeChecked();
    expect(role(/Proveedor/)).toBeDisabled();
    expect(role(/Empleado/)).toBeDisabled();
  });

  it('compras ve solo proveedores, con datos tributarios, sin desactivar', async () => {
    const list = vi.spyOn(thirdPartiesApi, 'fetchThirdParties').mockResolvedValue({
      items: [supplier],
      total: 1,
      page: 1,
      pageSize: 20,
      totalPages: 1,
    });
    renderPage(COMPRAS);
    expect(await screen.findByText('Droguería Mayorista')).toBeInTheDocument();
    await waitFor(() =>
      expect(list).toHaveBeenCalledWith(expect.objectContaining({ role: 'SUPPLIER' })),
    );
    expect(screen.getAllByRole('tab').map((tab) => tab.textContent)).toEqual(['Proveedores']);
    expect(
      screen.getByRole('button', { name: 'Datos tributarios de Droguería Mayorista' }),
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Desactivar Tercero' })).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Nuevo Tercero' }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByRole('checkbox', { name: /Proveedor/ })).toBeChecked();
    expect(within(dialog).getByRole('checkbox', { name: /Cliente/ })).not.toBeChecked();
    expect(within(dialog).getByRole('checkbox', { name: /Cliente/ })).toBeDisabled();
  });

  it('solo third_parties:deactivate (admin) ofrece desactivar', async () => {
    vi.spyOn(thirdPartiesApi, 'fetchThirdParties').mockResolvedValue({
      items: [customer, supplier],
      total: 2,
      page: 1,
      pageSize: 20,
      totalPages: 1,
    });
    renderPage([
      SYSTEM_PERMISSIONS.THIRD_PARTIES_READ,
      SYSTEM_PERMISSIONS.THIRD_PARTIES_MANAGE,
      SYSTEM_PERMISSIONS.THIRD_PARTIES_DEACTIVATE,
    ]);
    expect(await screen.findByText('Carlos Gómez')).toBeInTheDocument();
    expect(screen.getAllByRole('tab')).toHaveLength(5);
    expect(screen.getAllByRole('button', { name: 'Desactivar Tercero' })).toHaveLength(2);
  });

  it('supervisor (third_parties:manage sin desactivar) edita pero no desactiva', async () => {
    vi.spyOn(thirdPartiesApi, 'fetchThirdParties').mockResolvedValue({
      items: [customer],
      total: 1,
      page: 1,
      pageSize: 20,
      totalPages: 1,
    });
    renderPage([SYSTEM_PERMISSIONS.THIRD_PARTIES_READ, SYSTEM_PERMISSIONS.THIRD_PARTIES_MANAGE]);
    expect(await screen.findByRole('button', { name: 'Editar Tercero' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Desactivar Tercero' })).toBeNull();
  });

  it.each([
    ['cartera', CARTERA, true],
    ['compras', COMPRAS, true],
    ['cajero', CAJERO, false],
  ])('el menú muestra el directorio a %s: %s', (_, permissions, visible) => {
    render(
      <ThemeProvider theme={appTheme}>
        <MemoryRouter>{withAuth(<AppSidebar open onClose={vi.fn()} />, permissions)}</MemoryRouter>
      </ThemeProvider>,
    );
    expect(Boolean(screen.queryByText('Directorio de Terceros'))).toBe(visible);
  });
});
