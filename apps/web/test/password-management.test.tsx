import { ThemeProvider } from '@mui/material';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SYSTEM_PERMISSIONS, type SystemUserListItemDto } from '@farmacia/contracts';
import { AuthContext, type AuthContextValue } from '../src/features/auth/context/auth-context';
import { ChangePasswordDialog } from '../src/features/auth/components/ChangePasswordDialog';
import { changeOwnPassword } from '../src/features/auth/password.api';
import { validateNewPassword } from '../src/features/auth/password-policy';
import { UsersPage } from '../src/features/users/pages/UsersPage';
import { ProtectedRoute } from '../src/features/auth/routes/AuthRoutes';
import { Route, Routes } from 'react-router-dom';
import {
  fetchRoles,
  fetchUsers,
  resetSystemUserPassword,
} from '../src/features/users/api/users.api';
import { appTheme } from '../src/theme/app-theme';

vi.mock('../src/features/auth/password.api', () => ({ changeOwnPassword: vi.fn() }));
vi.mock('../src/features/users/api/users.api', () => ({
  fetchUsers: vi.fn(),
  fetchRoles: vi.fn(),
  createSystemUser: vi.fn(),
  updateSystemUserStatus: vi.fn(),
  updateSystemUserRoles: vi.fn(),
  resetSystemUserPassword: vi.fn(),
}));

const accounts: SystemUserListItemDto[] = [
  {
    id: 'admin-id',
    username: 'admin',
    isActive: true,
    createdAt: '2026-11-05T00:00:00.000Z',
    roles: ['admin'],
    mustChangePassword: false,
  },
  {
    id: 'cashier-id',
    username: 'laura.caja',
    isActive: true,
    createdAt: '2026-11-05T00:00:00.000Z',
    roles: ['cajero'],
    mustChangePassword: true,
  },
];

function renderUsers(permissions: string[]) {
  const context: AuthContextValue = {
    user: { id: 'admin-id', username: 'admin', isActive: true, roles: ['admin'], permissions },
    status: 'authenticated',
    sessionError: null,
    isLoggingIn: false,
    isLoggingOut: false,
    login: vi.fn(),
    logout: vi.fn(),
    retrySession: vi.fn(),
  };
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <ThemeProvider theme={appTheme}>
      <QueryClientProvider client={client}>
        <MemoryRouter>
          <AuthContext.Provider value={context}>
            <UsersPage />
          </AuthContext.Provider>
        </MemoryRouter>
      </QueryClientProvider>
    </ThemeProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(fetchUsers).mockResolvedValue(accounts);
  vi.mocked(fetchRoles).mockResolvedValue([]);
});

describe('contraseñas en frontend', () => {
  it('valida longitud y composición con la misma política de la API', () => {
    expect(validateNewPassword('short')).toMatch(/10 y 128/);
    expect(validateNewPassword('passwordonlylong')).toMatch(/mayúscula/);
    expect(validateNewPassword('Password1234')).toMatch(/especial/);
    expect(validateNewPassword('Password#2026')).toBeNull();
  });

  it('permite al gestor restablecer una contraseña ajena y confirma la revocación de sesiones', async () => {
    vi.mocked(resetSystemUserPassword).mockResolvedValue({ message: 'Contraseña restablecida.' });
    const tester = userEvent.setup();
    renderUsers([SYSTEM_PERMISSIONS.USERS_READ, SYSTEM_PERMISSIONS.USERS_UPDATE]);

    await screen.findByText('laura.caja');
    await tester.click(screen.getAllByRole('button', { name: 'Restablecer contraseña' })[1]);
    const dialog = screen.getByRole('dialog', { name: 'Restablecer contraseña' });
    expect(within(dialog).getByText(/se cerrarán todas las sesiones/i)).toBeInTheDocument();
    expect(within(dialog).getByText(/deberá cambiarla por una propia/i)).toBeInTheDocument();
    await tester.type(within(dialog).getByLabelText(/^Contraseña temporal/), 'Password#2026');
    await tester.type(within(dialog).getByLabelText(/^Confirmar nueva contraseña/), 'Password#2026');
    await tester.click(within(dialog).getByRole('button', { name: 'Restablecer contraseña' }));

    await waitFor(() =>
      expect(resetSystemUserPassword).toHaveBeenCalledWith('cashier-id', 'Password#2026'),
    );
    await waitFor(() =>
      expect(
        screen.queryByRole('dialog', { name: 'Restablecer contraseña' }),
      ).not.toBeInTheDocument(),
    );
  });

  it('oculta el restablecimiento a quien no tiene permiso de actualizar usuarios', async () => {
    renderUsers([SYSTEM_PERMISSIONS.USERS_READ]);
    await screen.findByText('laura.caja');
    expect(
      screen.queryByRole('button', { name: 'Restablecer contraseña' }),
    ).not.toBeInTheDocument();
  });

  it('exige contraseña actual y confirmación al cambiar la propia contraseña', async () => {
    const tester = userEvent.setup();
    render(
      <ThemeProvider theme={appTheme}>
        <ChangePasswordDialog open onClose={vi.fn()} />
      </ThemeProvider>,
    );
    const dialog = screen.getByRole('dialog', { name: 'Cambiar mi contraseña' });
    fireEvent.submit(
      within(dialog).getByRole('button', { name: 'Guardar contraseña' }).closest('form')!,
    );
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('contraseña actual');
    await tester.type(within(dialog).getByLabelText(/^Contraseña actual/), 'OldPassword#2026');
    await tester.type(within(dialog).getByLabelText(/^Nueva contraseña/), 'NewPassword#2026');
    await tester.type(
      within(dialog).getByLabelText(/^Confirmar nueva contraseña/),
      'Different#2026',
    );
    await tester.click(within(dialog).getByRole('button', { name: 'Guardar contraseña' }));
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('no coincide');
    expect(changeOwnPassword).not.toHaveBeenCalled();
  });

  it('envía la contraseña actual y muestra el error del servidor sin cerrar el diálogo', async () => {
    vi.mocked(changeOwnPassword).mockRejectedValue(new Error('Contraseña actual incorrecta.'));
    const tester = userEvent.setup();
    render(
      <ThemeProvider theme={appTheme}>
        <ChangePasswordDialog open onClose={vi.fn()} />
      </ThemeProvider>,
    );
    const dialog = screen.getByRole('dialog', { name: 'Cambiar mi contraseña' });
    await tester.type(within(dialog).getByLabelText(/^Contraseña actual/), 'OldPassword#2026');
    await tester.type(within(dialog).getByLabelText(/^Nueva contraseña/), 'NewPassword#2026');
    await tester.type(
      within(dialog).getByLabelText(/^Confirmar nueva contraseña/),
      'NewPassword#2026',
    );
    await tester.click(within(dialog).getByRole('button', { name: 'Guardar contraseña' }));
    await waitFor(() =>
      expect(changeOwnPassword).toHaveBeenCalledWith('OldPassword#2026', 'NewPassword#2026'),
    );
    expect(await within(dialog).findByRole('alert')).toHaveTextContent(
      'Contraseña actual incorrecta.',
    );
  });

  it('marca en el gestor las cuentas que tienen una contraseña temporal pendiente', async () => {
    renderUsers([SYSTEM_PERMISSIONS.USERS_READ]);

    await screen.findByText('laura.caja');
    expect(screen.getAllByText('Contraseña temporal')).toHaveLength(1);
  });

  it('bloquea la aplicación y exige el cambio cuando la contraseña es temporal', async () => {
    const logout = vi.fn().mockResolvedValue(undefined);
    const context: AuthContextValue = {
      user: {
        id: 'cashier-id',
        username: 'laura.caja',
        isActive: true,
        roles: ['cajero'],
        permissions: [],
        mustChangePassword: true,
      },
      status: 'authenticated',
      sessionError: null,
      isLoggingIn: false,
      isLoggingOut: false,
      login: vi.fn(),
      logout,
      retrySession: vi.fn(),
    };
    const tester = userEvent.setup();
    render(
      <ThemeProvider theme={appTheme}>
        <MemoryRouter initialEntries={['/']}>
          <AuthContext.Provider value={context}>
            <Routes>
              <Route element={<ProtectedRoute />}>
                <Route path="/" element={<p>Panel principal</p>} />
              </Route>
            </Routes>
          </AuthContext.Provider>
        </MemoryRouter>
      </ThemeProvider>,
    );

    const dialog = screen.getByRole('dialog', { name: 'Cambia tu contraseña temporal' });
    expect(screen.queryByText('Panel principal')).not.toBeInTheDocument();
    expect(within(dialog).queryByRole('button', { name: 'Cancelar' })).not.toBeInTheDocument();
    expect(within(dialog).getByLabelText(/^Contraseña temporal/)).toBeInTheDocument();

    fireEvent.keyDown(dialog, { key: 'Escape' });
    expect(screen.getByRole('dialog', { name: 'Cambia tu contraseña temporal' })).toBeInTheDocument();

    expect(within(dialog).getByText('laura.caja')).toBeInTheDocument();
    await tester.click(within(dialog).getByRole('button', { name: 'Cerrar sesión' }));
    expect(logout).toHaveBeenCalled();
  });

  it('deja pasar a la aplicación cuando la contraseña ya es propia', () => {
    const context: AuthContextValue = {
      user: { id: 'u', username: 'laura.caja', isActive: true, mustChangePassword: false },
      status: 'authenticated',
      sessionError: null,
      isLoggingIn: false,
      isLoggingOut: false,
      login: vi.fn(),
      logout: vi.fn(),
      retrySession: vi.fn(),
    };
    render(
      <MemoryRouter initialEntries={['/']}>
        <AuthContext.Provider value={context}>
          <Routes>
            <Route element={<ProtectedRoute />}>
              <Route path="/" element={<p>Panel principal</p>} />
            </Route>
          </Routes>
        </AuthContext.Provider>
      </MemoryRouter>,
    );
    expect(screen.getByText('Panel principal')).toBeInTheDocument();
  });
});
