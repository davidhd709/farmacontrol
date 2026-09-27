import { ThemeProvider } from '@mui/material';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SYSTEM_PERMISSIONS, SYSTEM_ROLES, type CategoryDto } from '@farmacia/contracts';
import { ApiError } from '../src/api/http-client';
import { AuthContext, type AuthContextValue } from '../src/features/auth/context/auth-context';
import * as categoriesApi from '../src/features/catalog/api/categories.api';
import { CategoriesPage } from '../src/features/catalog/pages/CategoriesPage';
import { appTheme } from '../src/theme/app-theme';

const mockCategories: CategoryDto[] = [
  {
    id: 'cat-1',
    name: 'Analgésicos',
    description: 'Medicamentos para el dolor',
    isActive: true,
    createdAt: '2026-09-01T10:00:00.000Z',
    updatedAt: '2026-09-01T10:00:00.000Z',
  },
  {
    id: 'cat-2',
    name: 'Antibióticos',
    description: 'Tratamiento antimicrobiano',
    isActive: true,
    createdAt: '2026-09-02T10:00:00.000Z',
    updatedAt: '2026-09-02T10:00:00.000Z',
  },
  {
    id: 'cat-3',
    name: 'Cuidado Personal',
    description: 'Higiene y aseo personal',
    isActive: false,
    createdAt: '2026-09-03T10:00:00.000Z',
    updatedAt: '2026-09-03T10:00:00.000Z',
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

function renderCategoriesPage(authContext = createMockAuthContext([
  SYSTEM_PERMISSIONS.CATEGORIES_READ,
  SYSTEM_PERMISSIONS.CATEGORIES_MANAGE,
])) {
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
            <CategoriesPage />
          </AuthContext.Provider>
        </MemoryRouter>
      </QueryClientProvider>
    </ThemeProvider>,
  );
}

describe('Pantalla de Categorías (UX-08)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('renderiza la lista de categorías y columnas principales', async () => {
    vi.spyOn(categoriesApi, 'fetchCategories').mockResolvedValue({
      items: mockCategories,
      total: mockCategories.length,
      page: 1,
      pageSize: 10,
      totalPages: 1,
    });

    renderCategoriesPage();

    expect(await screen.findByText('Analgésicos')).toBeInTheDocument();
    expect(screen.getByText('Antibióticos')).toBeInTheDocument();
    expect(screen.getByText('Cuidado Personal')).toBeInTheDocument();
    expect(screen.getByText('Medicamentos para el dolor')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Categorías de Productos' })).toBeInTheDocument();
  });

  it('permite buscar categorías mediante el campo de búsqueda', async () => {
    const fetchSpy = vi.spyOn(categoriesApi, 'fetchCategories').mockResolvedValue({
      items: [mockCategories[0]],
      total: 1,
      page: 1,
      pageSize: 10,
      totalPages: 1,
    });

    renderCategoriesPage();
    await screen.findByText('Analgésicos');

    const searchInput = screen.getByLabelText('Buscar categoría');
    await userEvent.type(searchInput, 'Analg');

    await waitFor(() => {
      expect(fetchSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          search: 'Analg',
        }),
      );
    });
  });

  it('abre el diálogo y registra una nueva categoría exitosamente', async () => {
    vi.spyOn(categoriesApi, 'fetchCategories').mockResolvedValue({
      items: [],
      total: 0,
      page: 1,
      pageSize: 10,
      totalPages: 0,
    });

    const createSpy = vi.spyOn(categoriesApi, 'createCategory').mockResolvedValue({
      id: 'cat-new',
      name: 'Vitaminas y Suplementos',
      description: 'Complejos vitamínicos',
      isActive: true,
      createdAt: '2026-09-25T00:00:00.000Z',
      updatedAt: '2026-09-25T00:00:00.000Z',
    });

    renderCategoriesPage();

    const newBtn = await screen.findByTestId('create-category-btn');
    fireEvent.click(newBtn);

    expect(await screen.findByRole('dialog')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Nueva Categoría' })).toBeInTheDocument();

    const nameInput = screen.getByLabelText(/Nombre de la categoría/);
    const descInput = screen.getByLabelText(/Descripción/);

    await userEvent.type(nameInput, 'Vitaminas y Suplementos');
    await userEvent.type(descInput, 'Complejos vitamínicos');

    const submitBtn = screen.getByRole('button', { name: 'Crear categoría' });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(createSpy).toHaveBeenCalledWith({
        name: 'Vitaminas y Suplementos',
        description: 'Complejos vitamínicos',
      });
    });
  });

  it('muestra error de validación cuando el nombre está vacío', async () => {
    vi.spyOn(categoriesApi, 'fetchCategories').mockResolvedValue({
      items: [],
      total: 0,
      page: 1,
      pageSize: 10,
      totalPages: 0,
    });

    renderCategoriesPage();

    const newBtn = await screen.findByTestId('create-category-btn');
    fireEvent.click(newBtn);

    const submitBtn = await screen.findByRole('button', { name: 'Crear categoría' });
    fireEvent.click(submitBtn);

    expect(
      await screen.findByText('El nombre de la categoría es requerido'),
    ).toBeInTheDocument();
  });

  it('muestra error específico cuando el backend responde conflicto 409 (nombre duplicado)', async () => {
    vi.spyOn(categoriesApi, 'fetchCategories').mockResolvedValue({
      items: [],
      total: 0,
      page: 1,
      pageSize: 10,
      totalPages: 0,
    });

    vi.spyOn(categoriesApi, 'createCategory').mockRejectedValue(
      new ApiError('Ya existe una categoría activa con el nombre "Analgésicos".', 409),
    );

    renderCategoriesPage();

    fireEvent.click(await screen.findByTestId('create-category-btn'));

    const nameInput = await screen.findByLabelText(/Nombre de la categoría/);
    await userEvent.type(nameInput, 'Analgésicos');

    fireEvent.click(screen.getByRole('button', { name: 'Crear categoría' }));

    expect(
      await screen.findByText('Ya existe una categoría con este nombre.'),
    ).toBeInTheDocument();
  });

  it('permite abrir el diálogo de edición con datos precargados y enviar actualización', async () => {
    vi.spyOn(categoriesApi, 'fetchCategories').mockResolvedValue({
      items: [mockCategories[0]],
      total: 1,
      page: 1,
      pageSize: 10,
      totalPages: 1,
    });

    const updateSpy = vi.spyOn(categoriesApi, 'updateCategory').mockResolvedValue({
      ...mockCategories[0],
      name: 'Analgésicos Generales',
    });

    renderCategoriesPage();

    const editBtn = await screen.findByRole('button', {
      name: 'Editar categoría Analgésicos',
    });
    fireEvent.click(editBtn);

    expect(await screen.findByRole('heading', { name: 'Editar Categoría' })).toBeInTheDocument();
    const nameInput = screen.getByLabelText(/Nombre de la categoría/);
    expect(nameInput).toHaveValue('Analgésicos');

    await userEvent.clear(nameInput);
    await userEvent.type(nameInput, 'Analgésicos Generales');

    fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }));

    await waitFor(() => {
      expect(updateSpy).toHaveBeenCalledWith('cat-1', {
        name: 'Analgésicos Generales',
        description: 'Medicamentos para el dolor',
      });
    });
  });

  it('permite confirmar la inactivación lógica de una categoría', async () => {
    vi.spyOn(categoriesApi, 'fetchCategories').mockResolvedValue({
      items: [mockCategories[0]],
      total: 1,
      page: 1,
      pageSize: 10,
      totalPages: 1,
    });

    const deactivateSpy = vi.spyOn(categoriesApi, 'deactivateCategory').mockResolvedValue({
      ...mockCategories[0],
      isActive: false,
    });

    renderCategoriesPage();

    const inactivateBtn = await screen.findByRole('button', {
      name: 'Inactivar categoría Analgésicos',
    });
    fireEvent.click(inactivateBtn);

    expect(
      await screen.findByRole('heading', { name: 'Inactivar Categoría' }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/¿Estás seguro de que deseas inactivar la categoría/),
    ).toBeInTheDocument();

    const confirmBtn = screen.getByRole('button', { name: 'Sí, inactivar' });
    fireEvent.click(confirmBtn);

    await waitFor(() => {
      expect(deactivateSpy).toHaveBeenCalledWith('cat-1');
    });
  });

  it('oculta los controles de gestión si el usuario no tiene permiso categories:manage', async () => {
    vi.spyOn(categoriesApi, 'fetchCategories').mockResolvedValue({
      items: [mockCategories[0]],
      total: 1,
      page: 1,
      pageSize: 10,
      totalPages: 1,
    });

    // Solo permiso de lectura
    const readOnlyAuth = createMockAuthContext([SYSTEM_PERMISSIONS.CATEGORIES_READ]);
    renderCategoriesPage(readOnlyAuth);

    expect(await screen.findByText('Analgésicos')).toBeInTheDocument();
    expect(screen.queryByTestId('create-category-btn')).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Editar categoría Analgésicos' }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Inactivar categoría Analgésicos' }),
    ).not.toBeInTheDocument();
  });
});
