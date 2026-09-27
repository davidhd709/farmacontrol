import { render, screen } from '@testing-library/react';
import { ThemeProvider } from '@mui/material';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { AuthContext, type AuthContextValue } from '../src/features/auth/context/auth-context';
import { PermissionGate } from '../src/features/auth/components/PermissionGate';
import { usePermissions } from '../src/features/auth/hooks/usePermissions';
import { AuthenticatedHomePage } from '../src/pages/AuthenticatedHomePage';
import { appTheme } from '../src/theme/app-theme';
import { SYSTEM_PERMISSIONS, SYSTEM_ROLES } from '@farmacia/contracts';

function createMockAuthContextValue(user: AuthContextValue['user']): AuthContextValue {
  return {
    user,
    status: user ? 'authenticated' : 'unauthenticated',
    sessionError: null,
    isLoggingIn: false,
    isLoggingOut: false,
    login: vi.fn(),
    logout: vi.fn(),
    retrySession: vi.fn(),
  };
}

function renderWithContext(ui: React.ReactElement, authValue: AuthContextValue) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  return render(
    <ThemeProvider theme={appTheme}>
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <AuthContext.Provider value={authValue}>{ui}</AuthContext.Provider>
        </MemoryRouter>
      </QueryClientProvider>
    </ThemeProvider>,
  );
}

// Componente auxiliar para probar el hook usePermissions
function HookConsumer() {
  const { hasPermission, hasAnyPermission, hasAllPermissions, hasRole, isAdmin, roles, permissions } =
    usePermissions();

  return (
    <div>
      <span data-testid="is-admin">{isAdmin ? 'yes' : 'no'}</span>
      <span data-testid="has-sales-create">
        {hasPermission(SYSTEM_PERMISSIONS.SALES_CREATE) ? 'yes' : 'no'}
      </span>
      <span data-testid="has-users-delete">
        {hasPermission(SYSTEM_PERMISSIONS.USERS_DELETE) ? 'yes' : 'no'}
      </span>
      <span data-testid="has-any-perm">
        {hasAnyPermission([SYSTEM_PERMISSIONS.SALES_CREATE, SYSTEM_PERMISSIONS.USERS_DELETE])
          ? 'yes'
          : 'no'}
      </span>
      <span data-testid="has-all-perm">
        {hasAllPermissions([SYSTEM_PERMISSIONS.SALES_CREATE, SYSTEM_PERMISSIONS.USERS_DELETE])
          ? 'yes'
          : 'no'}
      </span>
      <span data-testid="has-cajero-role">{hasRole(SYSTEM_ROLES.CAJERO) ? 'yes' : 'no'}</span>
      <span data-testid="roles-count">{roles.length}</span>
      <span data-testid="permissions-count">{permissions.length}</span>
    </div>
  );
}

describe('RBAC Frontend — usePermissions y PermissionGate (Slice 003.3)', () => {
  describe('usePermissions hook', () => {
    it('retorna valores seguros y vacíos ante usuario no autenticado', () => {
      const authValue = createMockAuthContextValue(null);
      renderWithContext(<HookConsumer />, authValue);

      expect(screen.getByTestId('is-admin')).toHaveTextContent('no');
      expect(screen.getByTestId('has-sales-create')).toHaveTextContent('no');
      expect(screen.getByTestId('has-cajero-role')).toHaveTextContent('no');
      expect(screen.getByTestId('roles-count')).toHaveTextContent('0');
      expect(screen.getByTestId('permissions-count')).toHaveTextContent('0');
    });

    it('evalúa correctamente permisos y roles para un usuario cajero', () => {
      const authValue = createMockAuthContextValue({
        id: 'u-1',
        username: 'cajero_test',
        isActive: true,
        roles: [SYSTEM_ROLES.CAJERO],
        permissions: [SYSTEM_PERMISSIONS.SALES_CREATE, SYSTEM_PERMISSIONS.SALES_READ],
      });
      renderWithContext(<HookConsumer />, authValue);

      expect(screen.getByTestId('is-admin')).toHaveTextContent('no');
      expect(screen.getByTestId('has-sales-create')).toHaveTextContent('yes');
      expect(screen.getByTestId('has-users-delete')).toHaveTextContent('no');
      expect(screen.getByTestId('has-any-perm')).toHaveTextContent('yes');
      expect(screen.getByTestId('has-all-perm')).toHaveTextContent('no');
      expect(screen.getByTestId('has-cajero-role')).toHaveTextContent('yes');
      expect(screen.getByTestId('roles-count')).toHaveTextContent('1');
      expect(screen.getByTestId('permissions-count')).toHaveTextContent('2');
    });

    it('identifica correctamente al rol admin', () => {
      const authValue = createMockAuthContextValue({
        id: 'u-admin',
        username: 'admin_test',
        isActive: true,
        roles: [SYSTEM_ROLES.ADMIN],
        permissions: Object.values(SYSTEM_PERMISSIONS),
      });
      renderWithContext(<HookConsumer />, authValue);

      expect(screen.getByTestId('is-admin')).toHaveTextContent('yes');
    });
  });

  describe('PermissionGate component', () => {
    it('muestra los hijos cuando el usuario cuenta con el permiso requerido', () => {
      const authValue = createMockAuthContextValue({
        id: 'u-1',
        username: 'cajero_test',
        isActive: true,
        roles: [SYSTEM_ROLES.CAJERO],
        permissions: [SYSTEM_PERMISSIONS.SALES_CREATE],
      });

      renderWithContext(
        <PermissionGate permission={SYSTEM_PERMISSIONS.SALES_CREATE}>
          <button type="button">Botón Permitido</button>
        </PermissionGate>,
        authValue,
      );

      expect(screen.getByRole('button', { name: 'Botón Permitido' })).toBeInTheDocument();
    });

    it('no renderiza nada cuando el usuario carece del permiso requerido', () => {
      const authValue = createMockAuthContextValue({
        id: 'u-1',
        username: 'cajero_test',
        isActive: true,
        roles: [SYSTEM_ROLES.CAJERO],
        permissions: [SYSTEM_PERMISSIONS.SALES_CREATE],
      });

      renderWithContext(
        <PermissionGate permission={SYSTEM_PERMISSIONS.USERS_DELETE}>
          <button type="button">Botón Restringido</button>
        </PermissionGate>,
        authValue,
      );

      expect(screen.queryByRole('button', { name: 'Botón Restringido' })).not.toBeInTheDocument();
    });

    it('renderiza fallback personalizado cuando el permiso está ausente', () => {
      const authValue = createMockAuthContextValue({
        id: 'u-1',
        username: 'cajero_test',
        isActive: true,
        roles: [SYSTEM_ROLES.CAJERO],
        permissions: [],
      });

      renderWithContext(
        <PermissionGate
          permission={SYSTEM_PERMISSIONS.SALES_CREATE}
          fallback={<span>Acceso Restringido</span>}
        >
          <button type="button">Botón Permitido</button>
        </PermissionGate>,
        authValue,
      );

      expect(screen.queryByRole('button', { name: 'Botón Permitido' })).not.toBeInTheDocument();
      expect(screen.getByText('Acceso Restringido')).toBeInTheDocument();
    });
  });

  describe('AuthenticatedHomePage adaptada por RBAC', () => {
    it('muestra las tarjetas de POS pero oculta Administración para un cajero', () => {
      const authValue = createMockAuthContextValue({
        id: 'u-cajero',
        username: 'cajero_operativo',
        isActive: true,
        roles: [SYSTEM_ROLES.CAJERO],
        permissions: [SYSTEM_PERMISSIONS.SALES_CREATE, SYSTEM_PERMISSIONS.SALES_READ],
      });

      renderWithContext(<AuthenticatedHomePage />, authValue);

      expect(screen.getByText(/Tu sesión está activa/i)).toBeInTheDocument();
      expect(screen.getByText(/cajero_operativo/i)).toBeInTheDocument();
      expect(screen.getByText('cajero')).toBeInTheDocument();

      // Módulo POS debe existir
      expect(screen.getByText('Punto de Venta (POS)')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Nueva Venta' })).toBeInTheDocument();

      // Módulo de Administración / Gestión de Usuarios NO debe existir para el cajero
      expect(screen.queryByTestId('users-nav-btn')).not.toBeInTheDocument();
      expect(screen.queryByText('Gestión de Usuarios')).not.toBeInTheDocument();
    });

    it('muestra el módulo de Administración / Gestión de Usuarios para un usuario con permiso users:read', () => {
      const authValue = createMockAuthContextValue({
        id: 'u-admin',
        username: 'admin_general',
        isActive: true,
        roles: [SYSTEM_ROLES.ADMIN],
        permissions: [
          SYSTEM_PERMISSIONS.SALES_CREATE,
          SYSTEM_PERMISSIONS.USERS_READ,
          SYSTEM_PERMISSIONS.INVENTORY_READ,
        ],
      });

      renderWithContext(<AuthenticatedHomePage />, authValue);

      expect(screen.getByText('Punto de Venta (POS)')).toBeInTheDocument();
      expect(screen.getByText('Gestión de Usuarios')).toBeInTheDocument();
      expect(screen.getByTestId('users-nav-btn')).toBeInTheDocument();
    });
  });
});
