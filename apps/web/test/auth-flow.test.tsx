import { ThemeProvider } from '@mui/material';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { App } from '../src/App';
import { ApiError } from '../src/api/http-client';
import { authApi } from '../src/features/auth/api/auth.api';
import { AuthProvider } from '../src/features/auth/context/AuthContext';
import { appTheme } from '../src/theme/app-theme';

function renderApplication(initialEntry = '/login') {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

  return render(
    <ThemeProvider theme={appTheme}>
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={[initialEntry]}>
          <AuthProvider>
            <App />
          </AuthProvider>
        </MemoryRouter>
      </QueryClientProvider>
    </ThemeProvider>,
  );
}

describe('flujo frontend de autenticación', () => {
  it('muestra el formulario al no existir una sesión activa', async () => {
    vi.spyOn(authApi, 'getCurrentUser').mockResolvedValue(null);

    renderApplication();

    expect(await screen.findByRole('heading', { name: 'Iniciar sesión' })).toBeInTheDocument();
    expect(screen.getByLabelText('Usuario')).toHaveFocus();
    expect(screen.getByLabelText('Contraseña')).toHaveAttribute('type', 'password');
  });

  it('valida el formulario sin enviar credenciales inválidas', async () => {
    vi.spyOn(authApi, 'getCurrentUser').mockResolvedValue(null);
    const loginSpy = vi.spyOn(authApi, 'login');

    renderApplication();
    await screen.findByRole('heading', { name: 'Iniciar sesión' });

    fireEvent.submit(screen.getByRole('button', { name: 'Ingresar' }).closest('form')!);

    expect(
      await screen.findByText('El usuario debe tener al menos 3 caracteres.'),
    ).toBeInTheDocument();
    expect(
      screen.getByText('La contraseña debe tener al menos 10 caracteres.'),
    ).toBeInTheDocument();
    expect(loginSpy).not.toHaveBeenCalled();
  });

  it('inicia sesión y navega al área protegida', async () => {
    const user = { id: 'f0e8f7b1-0f48-4b7f-9d95-3a75c267e020', username: 'cajero', isActive: true };
    vi.spyOn(authApi, 'getCurrentUser').mockResolvedValue(null);
    const loginSpy = vi.spyOn(authApi, 'login').mockResolvedValue({
      user,
      message: 'Inicio de sesión exitoso.',
    });

    const tester = userEvent.setup();
    renderApplication();
    await screen.findByRole('heading', { name: 'Iniciar sesión' });

    await tester.type(screen.getByLabelText('Usuario'), 'cajero');
    await tester.type(screen.getByLabelText('Contraseña'), 'Password#2026!');
    await tester.click(screen.getByRole('button', { name: 'Ingresar' }));

    await waitFor(() => {
      expect(loginSpy).toHaveBeenCalledWith({
        username: 'cajero',
        password: 'Password#2026!',
      });
    });
    expect(await screen.findByRole('heading', { name: /¡Bienvenido/i })).toBeInTheDocument();
    expect(screen.getAllByText(/cajero/i)[0]).toBeInTheDocument();
  });

  it('muestra un error accesible ante credenciales incorrectas', async () => {
    vi.spyOn(authApi, 'getCurrentUser').mockResolvedValue(null);
    vi.spyOn(authApi, 'login').mockRejectedValue(
      new ApiError('Nombre de usuario o contraseña incorrectos.', 401),
    );

    const tester = userEvent.setup();
    renderApplication();
    await screen.findByRole('heading', { name: 'Iniciar sesión' });

    await tester.type(screen.getByLabelText('Usuario'), 'cajero');
    await tester.type(screen.getByLabelText('Contraseña'), 'Password#2026!');
    await tester.click(screen.getByRole('button', { name: 'Ingresar' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'El usuario o la contraseña son incorrectos.',
    );
  });

  it('restaura una sesión existente y permite cerrarla', async () => {
    const user = { id: '9a1bc64e-08b4-41bc-a1ec-b8f77ed9b8fe', username: 'admin', isActive: true };
    vi.spyOn(authApi, 'getCurrentUser').mockResolvedValue(user);
    const logoutSpy = vi.spyOn(authApi, 'logout').mockResolvedValue({
      message: 'Sesión cerrada correctamente.',
    });

    const tester = userEvent.setup();
    renderApplication('/');

    expect(await screen.findByRole('heading', { name: /¡Bienvenido/i })).toBeInTheDocument();
    await tester.click(screen.getByRole('button', { name: /Cerrar sesión/i }));

    await waitFor(() => expect(logoutSpy).toHaveBeenCalledOnce());
    expect(await screen.findByRole('heading', { name: 'Iniciar sesión' })).toBeInTheDocument();
  });
});
