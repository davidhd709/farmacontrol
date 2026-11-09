import { ThemeProvider } from '@mui/material';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SYSTEM_PERMISSIONS, SYSTEM_ROLES } from '@farmacia/contracts';
import { AuthContext, type AuthContextValue } from '../src/features/auth/context/auth-context';
import * as categoriesApi from '../src/features/catalog/api/categories.api';
import * as productsApi from '../src/features/catalog/api/products.api';
import { ProductsPage } from '../src/features/catalog/pages/ProductsPage';
import { appTheme } from '../src/theme/app-theme';

const renderProductsPage = (permissions: string[] = [SYSTEM_PERMISSIONS.PRODUCTS_READ]) => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });

  const authValue: AuthContextValue = {
    user: {
      id: 'usr-1',
      username: 'admin',
      fullName: 'Administrador',
      role: SYSTEM_ROLES.ADMIN,
      permissions,
      mustChangePassword: false,
    },
    isAuthenticated: true,
    isLoading: false,
    login: vi.fn(),
    logout: vi.fn(),
    hasPermission: (perm: string) => permissions.includes(perm),
    hasAnyRole: () => true,
    completePasswordReset: vi.fn(),
  };

  return render(
    <QueryClientProvider client={queryClient}>
      <ThemeProvider theme={appTheme}>
        <AuthContext.Provider value={authValue}>
          <MemoryRouter>
            <ProductsPage />
          </MemoryRouter>
        </AuthContext.Provider>
      </ThemeProvider>
    </QueryClientProvider>,
  );
};

describe('Product Import / Export Actions on ProductsPage', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(categoriesApi, 'fetchCategories').mockResolvedValue({
      items: [],
      total: 0,
      page: 1,
      pageSize: 100,
      totalPages: 1,
    });
    vi.spyOn(productsApi, 'fetchProducts').mockResolvedValue({
      items: [],
      total: 0,
      page: 1,
      pageSize: 20,
      totalPages: 0,
    });
  });

  it('muestra botones de Descargar Plantilla y Exportar (.xlsx) para lectura', async () => {
    renderProductsPage([SYSTEM_PERMISSIONS.PRODUCTS_READ]);

    expect(await screen.findByRole('heading', { name: 'Catálogo de Productos' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Descargar Plantilla' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Exportar (.xlsx)' })).toBeInTheDocument();
    // Con sólo lectura NO debe mostrar Importar (.xlsx) ni Nuevo Producto
    expect(screen.queryByRole('button', { name: 'Importar (.xlsx)' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Nuevo Producto' })).toBeNull();
  });

  it('muestra el botón Importar (.xlsx) cuando el usuario tiene permiso PRODUCTS_MANAGE', async () => {
    renderProductsPage([
      SYSTEM_PERMISSIONS.PRODUCTS_READ,
      SYSTEM_PERMISSIONS.PRODUCTS_MANAGE,
    ]);

    expect(await screen.findByRole('heading', { name: 'Catálogo de Productos' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Importar (.xlsx)' })).toBeInTheDocument();

    // Al hacer clic en Importar (.xlsx), abre el diálogo de importación
    fireEvent.click(screen.getByRole('button', { name: 'Importar (.xlsx)' }));
    expect(await screen.findByText(/Importar Productos desde Excel/)).toBeInTheDocument();
  });
});

