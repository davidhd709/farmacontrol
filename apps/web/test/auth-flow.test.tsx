import { ThemeProvider } from '@mui/material';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { App } from '../src/App';
import { SYSTEM_PERMISSIONS } from '@farmacia/contracts';
import { ApiError, apiRequest } from '../src/api/http-client';
import { authApi } from '../src/features/auth/api/auth.api';
import { authQueryKey, AuthProvider } from '../src/features/auth/context/AuthContext';
import { appTheme } from '../src/theme/app-theme';

function renderApplication(initialEntry = '/login') {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

  const rendered = render(
    <ThemeProvider theme={appTheme}>
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={[initialEntry]}>
          <AuthProvider>
            <App />
            <LocationProbe />
          </AuthProvider>
        </MemoryRouter>
      </QueryClientProvider>
    </ThemeProvider>,
  );
  return { ...rendered, queryClient };
}

function LocationProbe() {
  const location = useLocation();
  return (
    <output data-testid="location">
      {location.pathname}
      {location.search}
      {location.hash}
    </output>
  );
}

afterEach(() => vi.unstubAllGlobals());

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

it('401 en una consulta borra caché y sesión, redirige y login vuelve a la URL completa', async () => {
  const user = {
    id: 'cashier',
    username: 'cajero',
    isActive: true,
    roles: [],
    permissions: [SYSTEM_PERMISSIONS.SALES_CREATE],
  };
  vi.spyOn(authApi, 'getCurrentUser').mockResolvedValue(user);
  vi.spyOn(authApi, 'login').mockResolvedValue({ user, message: 'OK' });
  vi.stubGlobal(
    'fetch',
    vi.fn().mockImplementation(async (url) => {
      if (String(url).endsWith('/expired-query')) return new Response(null, { status: 401 });
      if (String(url).endsWith('/customers/default'))
        return new Response(
          JSON.stringify({
            id: 'default',
            name: 'Consumidor Final',
            documentNumber: '2222',
            isDefault: true,
            isActive: true,
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        );
      return new Response(JSON.stringify({ items: [], total: 0, page: 1, limit: 25 }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }),
  );
  const { queryClient } = renderApplication('/pos/scan?search=rx#list');
  await screen.findByRole('button', { name: /Cerrar sesión/i }, { timeout: 10_000 });
  queryClient.setQueryData(['private-data'], { customer: 'previous user' });
  let completeOldQuery!: (value: string) => void;
  let oldSignal: AbortSignal | undefined;
  const oldRequest = queryClient
    .fetchQuery({
      queryKey: ['old-in-flight'],
      queryFn: ({ signal }) => {
        oldSignal = signal;
        return new Promise<string>((resolve) => {
          completeOldQuery = resolve;
        });
      },
    })
    .catch(() => undefined);
  const request = queryClient.fetchQuery({
    queryKey: ['expired'],
    queryFn: () => apiRequest('expired-query'),
  });
  await request.catch(() => undefined);
  expect(await screen.findByRole('heading', { name: 'Iniciar sesión' })).toBeInTheDocument();
  expect(queryClient.getQueryData(authQueryKey)).toBeNull();
  expect(oldSignal?.aborted).toBe(true);
  completeOldQuery('previous user data');
  await oldRequest;
  expect(
    queryClient
      .getQueryCache()
      .getAll()
      .map((query) => query.queryKey),
  ).toEqual([authQueryKey]);
  const tester = userEvent.setup();
  await tester.type(screen.getByLabelText('Usuario'), 'cajero');
  await tester.type(screen.getByLabelText('Contraseña'), 'Password#2026!');
  await tester.click(screen.getByRole('button', { name: 'Ingresar' }));
  await waitFor(() =>
    expect(screen.getByTestId('location')).toHaveTextContent('/pos/scan?search=rx#list'),
  );
});
