import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  ApiError,
  apiRequest,
  setUnauthorizedHandler,
  NO_PERMISSION_MESSAGE,
} from '../src/api/http-client';

afterEach(() => {
  vi.unstubAllGlobals();
  setUnauthorizedHandler(undefined);
});

describe('apiRequest', () => {
  it('envía cookies de sesión en las solicitudes', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ user: { id: '1', username: 'admin', isActive: true } }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    await apiRequest('auth/me');

    const expectedUrl = `${(import.meta.env.VITE_API_URL || '/api/v1').replace(/\/$/, '')}/auth/me`;
    expect(fetchMock).toHaveBeenCalledWith(
      expectedUrl,
      expect.objectContaining({ credentials: 'include' }),
    );
  });

  it('convierte una respuesta HTTP fallida en ApiError', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            statusCode: 401,
            message: 'Nombre de usuario o contraseña incorrectos.',
          }),
          {
            status: 401,
            headers: { 'content-type': 'application/json' },
          },
        ),
      ),
    );

    await expect(apiRequest('auth/login')).rejects.toMatchObject({
      name: 'ApiError',
      status: 401,
      message: 'Nombre de usuario o contraseña incorrectos.',
    });
  });

  it('entrega un mensaje accionable ante un fallo de red', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));

    await expect(apiRequest('auth/me')).rejects.toEqual(
      expect.objectContaining<ApiError>({
        status: 0,
        message:
          'No fue posible comunicarse con el servidor. Verifica tu conexión e intenta nuevamente.',
      }),
    );
  });
});

it('uniforma los errores 403 aunque el backend responda en inglés', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ message: 'Forbidden resource' }), {
        status: 403,
        headers: { 'content-type': 'application/json' },
      }),
    ),
  );
  await expect(apiRequest('products')).rejects.toMatchObject({
    status: 403,
    message: NO_PERMISSION_MESSAGE,
  });
  expect(new ApiError('Forbidden', 403).message).toBe(NO_PERMISSION_MESSAGE);
});

it('avisa en cualquier 401 salvo auth/me y auth/login y permite quitar el manejador', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockImplementation(async () => new Response(null, { status: 401 })),
  );
  const handler = vi.fn();
  const unregister = setUnauthorizedHandler(handler);
  for (const path of ['auth/me', '/auth/login', '/auth/me?refresh=1'])
    await expect(apiRequest(path)).rejects.toMatchObject({ status: 401 });
  expect(handler).not.toHaveBeenCalled();
  await expect(apiRequest('products')).rejects.toMatchObject({ status: 401 });
  expect(handler).toHaveBeenCalledOnce();
  unregister();
  await expect(apiRequest('sales')).rejects.toMatchObject({ status: 401 });
  expect(handler).toHaveBeenCalledOnce();
});
