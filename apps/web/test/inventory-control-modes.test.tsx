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

/** ADR-006 (F4): modo de control por producto en el catálogo y su efecto en el POS. */

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
  inventoryControlMode: 'LOT_EXPIRY',
  prescriptionRequired: false,
  baseUnit: 'TABLETA',
  basePrice: '200.00',
  baseCost: '100.00',
  isActive: true,
  availableStock: 100,
  createdAt: '2026-09-01T00:00:00.000Z',
  updatedAt: '2026-09-01T00:00:00.000Z',
};

const serviceProduct: ProductDto = {
  ...trackedProduct,
  id: 'prod-service',
  code: 'INY-01',
  name: 'Aplicación de inyección',
  baseUnit: 'SERVICIO',
  basePrice: '8000.00',
  inventoryControlMode: 'SERVICE',
  availableStock: undefined,
};

const serialProduct: ProductDto = {
  ...trackedProduct,
  id: 'prod-serial',
  code: 'GLU-01',
  name: 'Glucómetro',
  baseUnit: 'UNIDAD',
  basePrice: '90000.00',
  inventoryControlMode: 'SERIAL',
  availableStock: 2,
};

const settings = {
  sectorProfile: 'PHARMACY' as const,
  defaultControlMode: 'LOT_EXPIRY' as const,
  allowedControlModes: [
    'SERVICE',
    'SIMPLE',
    'LOT',
    'LOT_EXPIRY',
    'SERIAL',
  ] as ProductDto['inventoryControlMode'][],
  prescriptionRequiredControlMode: 'LOT_EXPIRY' as const,
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
    user: {
      id: 'usr-1',
      username: 'admin',
      isActive: true,
      roles: [SYSTEM_ROLES.ADMIN],
      permissions,
    },
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

async function fillRequiredProductFields(dialog: HTMLElement) {
  await userEvent.type(within(dialog).getByLabelText(/Nombre comercial/), 'Producto de prueba');
  fireEvent.mouseDown(within(dialog).getByLabelText(/Categoría/));
  fireEvent.click(await screen.findByRole('option', { name: 'Analgésicos' }));
  await userEvent.type(within(dialog).getByLabelText(/Código interno \(SKU\)/), 'PRU-01');
}

async function chooseControlMode(dialog: HTMLElement, label: string) {
  fireEvent.mouseDown(within(dialog).getByLabelText(/Control de inventario/));
  fireEvent.click(await screen.findByRole('option', { name: label }));
}

describe('Modo de control de inventario en el catálogo', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(categoriesApi, 'fetchCategories').mockResolvedValue({
      items: [category],
      total: 1,
      page: 1,
      pageSize: 100,
      totalPages: 1,
    });
    vi.spyOn(productsApi, 'fetchProductSettings').mockResolvedValue(settings);
  });

  it('propone el modo por defecto del perfil y envía el modo elegido', async () => {
    vi.spyOn(productsApi, 'fetchProducts').mockResolvedValue(page([]));
    const createSpy = vi.spyOn(productsApi, 'createProduct').mockResolvedValue(serviceProduct);
    renderWith(<ProductsPage />, catalogPermissions);

    fireEvent.click(await screen.findByTestId('create-product-btn'));
    const dialog = await screen.findByRole('dialog');
    expect(await within(dialog).findByText(/Lote y vencimiento obligatorios/)).toBeInTheDocument();

    await fillRequiredProductFields(dialog);
    await chooseControlMode(dialog, 'Servicio');
    expect(within(dialog).getByText(/No maneja existencias/)).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Registrar producto' }));

    await waitFor(() =>
      expect(createSpy).toHaveBeenCalledWith(
        expect.objectContaining({ inventoryControlMode: 'SERVICE' }),
      ),
    );
  });

  it('exige lote y vencimiento a un producto bajo fórmula médica sin llamar al API', async () => {
    vi.spyOn(productsApi, 'fetchProducts').mockResolvedValue(page([]));
    const createSpy = vi.spyOn(productsApi, 'createProduct');
    renderWith(<ProductsPage />, catalogPermissions);

    fireEvent.click(await screen.findByTestId('create-product-btn'));
    const dialog = await screen.findByRole('dialog');
    await fillRequiredProductFields(dialog);
    await chooseControlMode(dialog, 'Inventario simple');
    fireEvent.click(within(dialog).getByRole('switch', { name: /fórmula médica/ }));
    fireEvent.click(within(dialog).getByRole('button', { name: 'Registrar producto' }));

    expect(
      await within(dialog).findByText(/debe usar "Lote y vencimiento \(FEFO\)"/),
    ).toBeInTheDocument();
    expect(createSpy).not.toHaveBeenCalled();
  });

  it('muestra el modo de cada producto en el listado con texto', async () => {
    vi.spyOn(productsApi, 'fetchProducts').mockResolvedValue(
      page([trackedProduct, serviceProduct]),
    );
    renderWith(<ProductsPage />, catalogPermissions);

    expect(await screen.findByText('Lote y vencimiento (FEFO)')).toBeInTheDocument();
    expect(screen.getByText('Servicio')).toBeInTheDocument();
  });
});

describe('POS según el modo de control', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(customersApi, 'fetchDefaultCustomer').mockResolvedValue(defaultCustomer);
  });

  const addToCart = async (name: string) => {
    fireEvent.change(screen.getByLabelText(/Buscar producto por nombre/i), {
      target: { value: name.slice(0, 4) },
    });
    const options = await screen.findAllByRole('option');
    fireEvent.click(options.find((option) => option.textContent?.includes(name))!);
  };

  it('vende un servicio sin existencia ni descuento de inventario', async () => {
    vi.spyOn(productsApi, 'fetchProducts').mockResolvedValue(page([serviceProduct]));
    renderWith(<PosPage />, [SYSTEM_PERMISSIONS.SALES_CREATE, SYSTEM_PERMISSIONS.SALES_READ]);

    await screen.findByText('Consumidor Final');
    await addToCart('Aplicación de inyección');

    expect(await screen.findByText('Servicio: no descuenta inventario')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Cobrar y Liquidar/ })).toBeEnabled();
  });

  it('no deja cobrar una línea por serie hasta elegir una serie por unidad', async () => {
    vi.spyOn(productsApi, 'fetchProducts').mockResolvedValue(page([serialProduct]));
    const previewSpy = vi.spyOn(salesApi, 'fetchFefoPreview').mockResolvedValue({
      businessDay: '2026-10-25',
      lines: [
        {
          productId: serialProduct.id,
          presentationId: null,
          requiredBaseUnits: 1,
          availableBaseUnits: 2,
          shortfallBaseUnits: 0,
          allocations: [],
          availableSerials: ['SN-1', 'SN-2'],
        },
      ],
    });
    renderWith(<PosPage />, [SYSTEM_PERMISSIONS.SALES_CREATE, SYSTEM_PERMISSIONS.SALES_READ]);

    await screen.findByText('Consumidor Final');
    await addToCart('Glucómetro');

    const charge = screen.getByRole('button', { name: /Cobrar y Liquidar/ });
    expect(charge).toBeDisabled();
    expect(await screen.findByText('Elija 1 serie más')).toBeInTheDocument();
    expect(previewSpy).toHaveBeenCalledWith(
      { items: [{ productId: serialProduct.id, quantityCommercial: 1 }] },
      expect.anything(),
    );

    fireEvent.mouseDown(screen.getByLabelText(/Series de Glucómetro/));
    fireEvent.click(await screen.findByRole('option', { name: 'SN-2' }));
    await waitFor(() => expect(charge).toBeEnabled());
  });
});
