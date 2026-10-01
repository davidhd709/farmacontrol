import { ThemeProvider } from '@mui/material';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  SYSTEM_PERMISSIONS,
  SYSTEM_ROLES,
  type CategoryDto,
  type ProductDto,
} from '@farmacia/contracts';
import { ApiError } from '../src/api/http-client';
import { AuthContext, type AuthContextValue } from '../src/features/auth/context/auth-context';
import * as categoriesApi from '../src/features/catalog/api/categories.api';
import * as productsApi from '../src/features/catalog/api/products.api';
import { ProductsPage } from '../src/features/catalog/pages/ProductsPage';
import { appTheme } from '../src/theme/app-theme';

const mockCategories: CategoryDto[] = [
  {
    id: 'cat-1',
    name: 'Analgésicos',
    description: null,
    isActive: true,
    createdAt: '2026-09-01T00:00:00.000Z',
    updatedAt: '2026-09-01T00:00:00.000Z',
  },
  {
    id: 'cat-2',
    name: 'Antibióticos',
    description: null,
    isActive: true,
    createdAt: '2026-09-01T00:00:00.000Z',
    updatedAt: '2026-09-01T00:00:00.000Z',
  },
  {
    id: 'cat-home',
    name: 'Hogar',
    description: 'Productos no farmacéuticos para el hogar',
    isActive: true,
    createdAt: '2026-09-01T00:00:00.000Z',
    updatedAt: '2026-09-01T00:00:00.000Z',
  },
];

const mockProducts: ProductDto[] = [
  {
    id: 'prod-1',
    categoryId: 'cat-1',
    categoryName: 'Analgésicos',
    code: 'ACE-500',
    barcode: '7701234567890',
    name: 'Acetaminofén 500mg',
    genericName: 'Paracetamol',
    concentration: '500 mg',
    sanitaryRegistry: 'INVIMA 2021M-001234',
    manufacturer: 'Laboratorios Farmacia',
    description: 'Analgésico oral',
    requiresLotControl: true,
    prescriptionRequired: false,
    baseUnit: 'UNIDAD',
    basePrice: '1500.50',
    baseCost: '800.00',
    isActive: true,
    createdAt: '2026-09-01T10:00:00.000Z',
    updatedAt: '2026-09-01T10:00:00.000Z',
  },
  {
    id: 'prod-2',
    categoryId: 'cat-2',
    categoryName: 'Antibióticos',
    code: 'AMOX-500',
    barcode: '7709999888877',
    name: 'Amoxicilina 500mg',
    genericName: 'Amoxicilina Trihidrato',
    concentration: '500 mg',
    sanitaryRegistry: 'INVIMA 2020M-005678',
    manufacturer: 'Genfar',
    description: null,
    requiresLotControl: true,
    prescriptionRequired: true,
    baseUnit: 'UNIDAD',
    basePrice: '3200.00',
    baseCost: '2100.00',
    isActive: true,
    createdAt: '2026-09-02T10:00:00.000Z',
    updatedAt: '2026-09-02T10:00:00.000Z',
  },
];

function createMockAuthContext(permissions: string[] = []): AuthContextValue {
  return {
    user: {
      id: 'usr-1',
      username: 'farmaceutico',
      isActive: true,
      roles: [SYSTEM_ROLES.ADMIN],
      permissions,
    },
    status: 'authenticated',
    sessionError: null,
    isLoggingIn: false,
    isLoggingOut: false,
    login: vi.fn(),
    logout: vi.fn(),
    retrySession: vi.fn(),
  };
}

function renderProductsPage(
  authContext = createMockAuthContext([
    SYSTEM_PERMISSIONS.PRODUCTS_READ,
    SYSTEM_PERMISSIONS.PRODUCTS_MANAGE,
    SYSTEM_PERMISSIONS.CATEGORIES_READ,
  ]),
) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

  return render(
    <ThemeProvider theme={appTheme}>
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <AuthContext.Provider value={authContext}>
            <ProductsPage />
          </AuthContext.Provider>
        </MemoryRouter>
      </QueryClientProvider>
    </ThemeProvider>,
  );
}

describe('Pantalla de Catálogo de Productos (UX-06 y UX-07)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(categoriesApi, 'fetchCategories').mockResolvedValue({
      items: mockCategories,
      total: mockCategories.length,
      page: 1,
      pageSize: 100,
      totalPages: 1,
    });
  });

  it('renderiza la lista de productos y columnas principales de catálogo', async () => {
    vi.spyOn(productsApi, 'fetchProducts').mockResolvedValue({
      items: mockProducts,
      total: mockProducts.length,
      page: 1,
      pageSize: 10,
      totalPages: 1,
    });

    renderProductsPage();

    expect(await screen.findByText('Acetaminofén 500mg')).toBeInTheDocument();
    expect(screen.getByText('ACE-500')).toBeInTheDocument();
    expect(screen.getByText('Amoxicilina 500mg')).toBeInTheDocument();
    expect(screen.getByText('AMOX-500')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Catálogo de Productos' })).toBeInTheDocument();
  });

  it('permite filtrar productos mediante el campo de búsqueda', async () => {
    const fetchSpy = vi.spyOn(productsApi, 'fetchProducts').mockResolvedValue({
      items: [mockProducts[0]],
      total: 1,
      page: 1,
      pageSize: 10,
      totalPages: 1,
    });

    renderProductsPage();
    await screen.findByText('Acetaminofén 500mg');

    const searchInput = screen.getByLabelText('Buscar producto');
    await userEvent.type(searchInput, 'Paracetamol');

    await waitFor(() => {
      expect(fetchSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          search: 'Paracetamol',
        }),
      );
    });
  });

  it('abre el diálogo y registra un nuevo producto farmacéutico exitosamente', async () => {
    vi.spyOn(productsApi, 'fetchProducts').mockResolvedValue({
      items: [],
      total: 0,
      page: 1,
      pageSize: 10,
      totalPages: 0,
    });

    const createSpy = vi.spyOn(productsApi, 'createProduct').mockResolvedValue({
      id: 'prod-new',
      categoryId: 'cat-1',
      categoryName: 'Analgésicos',
      code: 'IBU-400',
      barcode: '7709999111122',
      name: 'Ibuprofeno 400mg',
      genericName: 'Ibuprofeno',
      concentration: '400 mg',
      sanitaryRegistry: 'INVIMA 2022M-003456',
      manufacturer: 'Laboratorios Genfar',
      description: null,
      requiresLotControl: true,
      prescriptionRequired: false,
      baseUnit: 'UNIDAD',
      basePrice: '2000.00',
      baseCost: '1100.00',
      isActive: true,
      createdAt: '2026-09-25T00:00:00.000Z',
      updatedAt: '2026-09-25T00:00:00.000Z',
    });

    renderProductsPage();

    const newBtn = await screen.findByTestId('create-product-btn');
    fireEvent.click(newBtn);

    const dialog = await screen.findByRole('dialog');
    expect(
      within(dialog).getByRole('heading', { name: 'Registrar Nuevo Producto' }),
    ).toBeInTheDocument();

    // Llenar campos requeridos
    const nameInput = within(dialog).getByLabelText(/Nombre comercial/);
    await userEvent.type(nameInput, 'Ibuprofeno 400mg');

    // Seleccionar categoría dentro del diálogo
    const categorySelect = within(dialog).getByLabelText(/Categoría/);
    fireEvent.mouseDown(categorySelect);
    const categoryOption = await screen.findByRole('option', { name: 'Analgésicos' });
    fireEvent.click(categoryOption);

    const codeInput = within(dialog).getByLabelText(/Código interno \(SKU\)/);
    await userEvent.type(codeInput, 'IBU-400');

    const priceInput = within(dialog).getByLabelText(/Precio base \(\$\)/);
    await userEvent.clear(priceInput);
    await userEvent.type(priceInput, '2000');

    const submitBtn = screen.getByRole('button', { name: 'Registrar producto' });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(createSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'Ibuprofeno 400mg',
          categoryId: 'cat-1',
          code: 'IBU-400',
          basePrice: 2000,
        }),
      );
    });
  });

  it('registra un producto no farmacéutico sin INVIMA, principio activo ni concentración', async () => {
    vi.spyOn(productsApi, 'fetchProducts').mockResolvedValue({
      items: [],
      total: 0,
      page: 1,
      pageSize: 10,
      totalPages: 0,
    });

    const createSpy = vi.spyOn(productsApi, 'createProduct').mockResolvedValue({
      id: 'prod-home',
      categoryId: 'cat-home',
      categoryName: 'Hogar',
      code: 'CAL-20',
      barcode: null,
      name: 'Caldero 20 cm',
      genericName: null,
      concentration: null,
      sanitaryRegistry: null,
      manufacturer: null,
      description: null,
      requiresLotControl: false,
      prescriptionRequired: false,
      baseUnit: 'UNIDAD',
      basePrice: '45000.00',
      baseCost: '0.00',
      isActive: true,
      createdAt: '2026-09-27T00:00:00.000Z',
      updatedAt: '2026-09-27T00:00:00.000Z',
    });

    renderProductsPage();

    fireEvent.click(await screen.findByTestId('create-product-btn'));
    const dialog = await screen.findByRole('dialog');

    expect(within(dialog).getByLabelText(/Principio activo.*opcional/i)).not.toBeRequired();
    expect(within(dialog).getByLabelText(/Concentración.*opcional/i)).not.toBeRequired();
    expect(within(dialog).getByLabelText(/Registro Sanitario.*opcional/i)).not.toBeRequired();

    await userEvent.type(within(dialog).getByLabelText(/Nombre comercial/), 'Caldero 20 cm');

    fireEvent.mouseDown(within(dialog).getByLabelText(/Categoría/));
    fireEvent.click(await screen.findByRole('option', { name: 'Hogar' }));

    await userEvent.type(within(dialog).getByLabelText(/Código interno \(SKU\)/), 'CAL-20');

    const priceInput = within(dialog).getByLabelText(/Precio base \(\$\)/);
    await userEvent.clear(priceInput);
    await userEvent.type(priceInput, '45000');

    fireEvent.click(within(dialog).getByRole('button', { name: 'Registrar producto' }));

    await waitFor(() => {
      expect(createSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'Caldero 20 cm',
          categoryId: 'cat-home',
          code: 'CAL-20',
          genericName: null,
          concentration: null,
          sanitaryRegistry: null,
          basePrice: 45000,
        }),
      );
    });
  });

  it('muestra error cuando el backend devuelve 409 por SKU duplicado', async () => {
    vi.spyOn(productsApi, 'fetchProducts').mockResolvedValue({
      items: [],
      total: 0,
      page: 1,
      pageSize: 10,
      totalPages: 0,
    });

    vi.spyOn(productsApi, 'createProduct').mockRejectedValue(
      new ApiError('Ya existe un producto registrado con el código interno (SKU) "ACE-500".', 409),
    );

    renderProductsPage();

    fireEvent.click(await screen.findByTestId('create-product-btn'));

    const dialog = await screen.findByRole('dialog');
    const nameInput = within(dialog).getByLabelText(/Nombre comercial/);
    await userEvent.type(nameInput, 'Acetaminofén Genérico');

    const categorySelect = within(dialog).getByLabelText(/Categoría/);
    fireEvent.mouseDown(categorySelect);
    fireEvent.click(await screen.findByRole('option', { name: 'Analgésicos' }));

    const codeInput = within(dialog).getByLabelText(/Código interno \(SKU\)/);
    await userEvent.type(codeInput, 'ACE-500');

    const priceInput = within(dialog).getByLabelText(/Precio base \(\$\)/);
    await userEvent.clear(priceInput);
    await userEvent.type(priceInput, '1500');

    fireEvent.click(within(dialog).getByRole('button', { name: 'Registrar producto' }));

    expect(
      await screen.findByText('Ya existe un producto registrado con este código interno (SKU).'),
    ).toBeInTheDocument();
  });

  it('permite abrir el diálogo de edición con datos precargados y enviar actualización', async () => {
    vi.spyOn(productsApi, 'fetchProducts').mockResolvedValue({
      items: [mockProducts[0]],
      total: 1,
      page: 1,
      pageSize: 10,
      totalPages: 1,
    });

    const updateSpy = vi.spyOn(productsApi, 'updateProduct').mockResolvedValue({
      ...mockProducts[0],
      name: 'Acetaminofén Forte 650mg',
    });

    renderProductsPage();

    const editBtn = await screen.findByRole('button', {
      name: 'Editar producto Acetaminofén 500mg',
    });
    fireEvent.click(editBtn);

    expect(await screen.findByRole('heading', { name: /Editar Producto:/ })).toBeInTheDocument();
    const nameInput = screen.getByLabelText(/Nombre comercial/);
    expect(nameInput).toHaveValue('Acetaminofén 500mg');

    await userEvent.clear(nameInput);
    await userEvent.type(nameInput, 'Acetaminofén Forte 650mg');

    fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }));

    await waitFor(() => {
      expect(updateSpy).toHaveBeenCalledWith(
        'prod-1',
        expect.objectContaining({
          name: 'Acetaminofén Forte 650mg',
        }),
      );
    });
  });

  it('permite confirmar la inactivación lógica de un producto', async () => {
    vi.spyOn(productsApi, 'fetchProducts').mockResolvedValue({
      items: [mockProducts[0]],
      total: 1,
      page: 1,
      pageSize: 10,
      totalPages: 1,
    });

    const deactivateSpy = vi.spyOn(productsApi, 'deactivateProduct').mockResolvedValue({
      ...mockProducts[0],
      isActive: false,
    });

    renderProductsPage();

    const inactivateBtn = await screen.findByRole('button', {
      name: 'Inactivar producto Acetaminofén 500mg',
    });
    fireEvent.click(inactivateBtn);

    expect(await screen.findByRole('heading', { name: 'Inactivar Producto' })).toBeInTheDocument();
    expect(
      screen.getByText(/¿Estás seguro de que deseas inactivar el producto/),
    ).toBeInTheDocument();

    const confirmBtn = screen.getByRole('button', { name: 'Sí, inactivar' });
    fireEvent.click(confirmBtn);

    await waitFor(() => {
      expect(deactivateSpy).toHaveBeenCalledWith('prod-1');
    });
  });

  it('oculta los controles de gestión si el usuario no tiene permiso products:manage (ej. cajero)', async () => {
    vi.spyOn(productsApi, 'fetchProducts').mockResolvedValue({
      items: [mockProducts[0]],
      total: 1,
      page: 1,
      pageSize: 10,
      totalPages: 1,
    });

    // Solo lectura de productos
    const readOnlyAuth = createMockAuthContext([SYSTEM_PERMISSIONS.PRODUCTS_READ]);
    renderProductsPage(readOnlyAuth);

    expect(await screen.findByText('Acetaminofén 500mg')).toBeInTheDocument();
    expect(screen.queryByTestId('create-product-btn')).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Editar producto Acetaminofén 500mg' }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Inactivar producto Acetaminofén 500mg' }),
    ).not.toBeInTheDocument();
  });
});
