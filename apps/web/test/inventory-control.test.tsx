import { ThemeProvider } from '@mui/material';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  SYSTEM_PERMISSIONS,
  SYSTEM_ROLES,
  type CategoryDto,
  type CustomerDto,
  type ProductDto,
} from '@farmacia/contracts';
import { AuthContext, type AuthContextValue } from '../src/features/auth/context/auth-context';
import * as categoriesApi from '../src/features/catalog/api/categories.api';
import * as customersApi from '../src/features/customers/api/customers.api';
import * as productsApi from '../src/features/catalog/api/products.api';
import * as salesApi from '../src/features/sales/api/sales.api';
import { ProductsPage } from '../src/features/catalog/pages/ProductsPage';
import { PosPage } from '../src/features/sales/pages/PosPage';
import { appTheme } from '../src/theme/app-theme';

/** FARM-AUD-002: la interfaz no permite configurar ni vender productos sin control por lote. */

const category: CategoryDto = {
  id: 'cat-1',
  name: 'Analgésicos',
  description: null,
  isActive: true,
  createdAt: '2026-09-01T00:00:00.000Z',
  updatedAt: '2026-09-01T00:00:00.000Z',
};

const trackedProduct: ProductDto = {
  id: 'prod-1',
  categoryId: 'cat-1',
  categoryName: 'Analgésicos',
  code: 'ACE-500',
  barcode: null,
  name: 'Acetaminofén 500 mg',
  genericName: null,
  concentration: null,
  sanitaryRegistry: null,
  manufacturer: null,
  description: null,
  requiresLotControl: true,
  prescriptionRequired: false,
  baseUnit: 'TABLETA',
  basePrice: '200.00',
  baseCost: '100.00',
  isActive: true,
  availableStock: 100,
  createdAt: '2026-09-01T00:00:00.000Z',
  updatedAt: '2026-09-01T00:00:00.000Z',
};

/** Producto creado antes de FARM-AUD-002 con el control desactivado. */
const legacyProduct: ProductDto = {
  ...trackedProduct,
  id: 'prod-legacy',
  code: 'CAL-20',
  name: 'Caldero 20 cm',
  baseUnit: 'UNIDAD',
  basePrice: '45000.00',
  requiresLotControl: false,
  availableStock: 5,
};

const defaultCustomer: CustomerDto = {
  id: 'cust-default',
  documentType: 'CC',
  documentNumber: '222222222222',
  name: 'Consumidor Final',
  isDefault: true,
  isActive: true,
  createdAt: '2026-09-26T00:00:00.000Z',
  updatedAt: '2026-09-26T00:00:00.000Z',
};

function authContext(permissions: string[]): AuthContextValue {
  return {
    user: { id: 'usr-1', username: 'admin', isActive: true, roles: [SYSTEM_ROLES.ADMIN], permissions },
    roles: [SYSTEM_ROLES.ADMIN],
    permissions,
    status: 'authenticated',
    sessionError: null,
    isLoggingIn: false,
    isLoggingOut: false,
    login: vi.fn(),
    logout: vi.fn(),
    retrySession: vi.fn(),
  } as AuthContextValue;
}

function renderWith(ui: ReactNode, permissions: string[]) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <ThemeProvider theme={appTheme}>
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <AuthContext.Provider value={authContext(permissions)}>{ui}</AuthContext.Provider>
        </MemoryRouter>
      </QueryClientProvider>
    </ThemeProvider>,
  );
}

const catalogPermissions = [
  SYSTEM_PERMISSIONS.PRODUCTS_READ,
  SYSTEM_PERMISSIONS.PRODUCTS_MANAGE,
  SYSTEM_PERMISSIONS.CATEGORIES_READ,
];

const page = (items: ProductDto[]) => ({
  items,
  total: items.length,
  page: 1,
  pageSize: 10,
  totalPages: 1,
});

describe('Control por lote obligatorio en catálogo (FARM-AUD-002)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(categoriesApi, 'fetchCategories').mockResolvedValue({
      items: [category],
      total: 1,
      page: 1,
      pageSize: 100,
      totalPages: 1,
    });
  });

  it('al registrar un producto el control por lote está activo, bloqueado y se envía como true', async () => {
    vi.spyOn(productsApi, 'fetchProducts').mockResolvedValue(page([]));
    const createSpy = vi.spyOn(productsApi, 'createProduct').mockResolvedValue(trackedProduct);
    renderWith(<ProductsPage />, catalogPermissions);

    fireEvent.click(await screen.findByTestId('create-product-btn'));
    const dialog = await screen.findByRole('dialog');

    const lotSwitch = within(dialog).getByRole('switch', { name: /Control por lote y vencimiento/ });
    expect(lotSwitch).toBeChecked();
    expect(lotSwitch).toBeDisabled();
    expect(within(dialog).getByText(/inventario sin lote aún no está disponible/i)).toBeInTheDocument();

    await userEvent.type(within(dialog).getByLabelText(/Nombre comercial/), 'Acetaminofén 500 mg');
    fireEvent.mouseDown(within(dialog).getByLabelText(/Categoría/));
    fireEvent.click(await screen.findByRole('option', { name: 'Analgésicos' }));
    await userEvent.type(within(dialog).getByLabelText(/Código interno \(SKU\)/), 'ACE-500');
    const price = within(dialog).getByLabelText(/Precio base \(\$\)/);
    await userEvent.clear(price);
    await userEvent.type(price, '200');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Registrar producto' }));

    await waitFor(() => {
      expect(createSpy).toHaveBeenCalledWith(expect.objectContaining({ requiresLotControl: true }));
    });
  });

  it('un producto con control no permite desactivarlo al editar', async () => {
    vi.spyOn(productsApi, 'fetchProducts').mockResolvedValue(page([trackedProduct]));
    renderWith(<ProductsPage />, catalogPermissions);

    fireEvent.click(await screen.findByRole('button', { name: 'Editar producto Acetaminofén 500 mg' }));
    const dialog = await screen.findByRole('dialog');

    const lotSwitch = within(dialog).getByRole('switch', { name: /Control por lote y vencimiento/ });
    expect(lotSwitch).toBeChecked();
    expect(lotSwitch).toBeDisabled();
    expect(within(dialog).queryByTestId('legacy-lot-control-warning')).not.toBeInTheDocument();
  });

  it('el listado identifica con texto los productos antiguos que no pueden venderse', async () => {
    vi.spyOn(productsApi, 'fetchProducts').mockResolvedValue(page([trackedProduct, legacyProduct]));
    renderWith(<ProductsPage />, catalogPermissions);

    expect(await screen.findByText('Sin lote · no vendible, regularizar')).toBeInTheDocument();
    expect(screen.getByText('Lote / FEFO')).toBeInTheDocument();
  });

  it('un producto antiguo muestra el aviso y se edita sin activar el control de forma implícita', async () => {
    vi.spyOn(productsApi, 'fetchProducts').mockResolvedValue(page([legacyProduct]));
    const updateSpy = vi.spyOn(productsApi, 'updateProduct').mockResolvedValue(legacyProduct);
    renderWith(<ProductsPage />, catalogPermissions);

    fireEvent.click(await screen.findByRole('button', { name: 'Editar producto Caldero 20 cm' }));
    const dialog = await screen.findByRole('dialog');

    expect(within(dialog).getByTestId('legacy-lot-control-warning')).toHaveTextContent(/no puede venderse/);
    const lotSwitch = within(dialog).getByRole('switch', { name: /Control por lote y vencimiento/ });
    expect(lotSwitch).not.toBeChecked();
    expect(lotSwitch).toBeEnabled();

    const name = within(dialog).getByLabelText(/Nombre comercial/);
    await userEvent.clear(name);
    await userEvent.type(name, 'Caldero 20 cm acero');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Guardar cambios' }));

    await waitFor(() => expect(updateSpy).toHaveBeenCalled());
    const payload = updateSpy.mock.calls[0][1];
    expect(payload).toMatchObject({ name: 'Caldero 20 cm acero' });
    expect(payload).not.toHaveProperty('requiresLotControl');
  });

  it('un producto antiguo se regulariza al activar el control explícitamente', async () => {
    vi.spyOn(productsApi, 'fetchProducts').mockResolvedValue(page([legacyProduct]));
    const updateSpy = vi
      .spyOn(productsApi, 'updateProduct')
      .mockResolvedValue({ ...legacyProduct, requiresLotControl: true });
    renderWith(<ProductsPage />, catalogPermissions);

    fireEvent.click(await screen.findByRole('button', { name: 'Editar producto Caldero 20 cm' }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.click(within(dialog).getByRole('switch', { name: /Control por lote y vencimiento/ }));
    fireEvent.click(within(dialog).getByRole('button', { name: 'Guardar cambios' }));

    await waitFor(() => {
      expect(updateSpy).toHaveBeenCalledWith(
        'prod-legacy',
        expect.objectContaining({ requiresLotControl: true }),
      );
    });
  });
});

describe('POS ante productos sin control por lote (FARM-AUD-002)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(customersApi, 'fetchDefaultCustomer').mockResolvedValue(defaultCustomer);
    vi.spyOn(productsApi, 'fetchProducts').mockResolvedValue(page([legacyProduct, trackedProduct]));
  });

  it('muestra el producto antiguo como no vendible, lo deshabilita y no lo agrega al carrito', async () => {
    const confirmSpy = vi.spyOn(salesApi, 'confirmSale');
    renderWith(<PosPage />, [SYSTEM_PERMISSIONS.SALES_CREATE, SYSTEM_PERMISSIONS.SALES_READ]);

    await screen.findByText('Consumidor Final');
    fireEvent.change(screen.getByLabelText(/Buscar producto por nombre/i), { target: { value: 'Cal' } });

    const options = await screen.findAllByRole('option');
    const legacyOption = options.find((option) => option.textContent?.includes('Caldero 20 cm'));
    expect(legacyOption).toBeDefined();
    expect(legacyOption).toHaveAttribute('aria-disabled', 'true');
    expect(within(legacyOption!).getByText('No vendible: regularizar en catálogo')).toBeInTheDocument();

    fireEvent.click(legacyOption!);
    expect(screen.queryByText(/FEFO: descuenta/)).not.toBeInTheDocument();
    expect(confirmSpy).not.toHaveBeenCalled();
  });
});
