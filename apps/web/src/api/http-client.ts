import type { ApiResponse } from '@farmacia/contracts';

const DEFAULT_API_URL = '/api/v1';

const apiUrl = (import.meta.env.VITE_API_URL || DEFAULT_API_URL).replace(/\/$/, '');

export const NO_PERMISSION_MESSAGE =
  'No tienes permiso para realizar esta acción. Si lo necesitas, pide a un administrador que lo asigne a tu rol.';

let unauthorizedHandler: (() => void) | undefined;
export function setUnauthorizedHandler(handler?: () => void) {
  unauthorizedHandler = handler;
  return () => {
    if (unauthorizedHandler === handler) unauthorizedHandler = undefined;
  };
}

interface NestErrorPayload {
  message?: string | string[];
  error?: string;
  statusCode?: number;
}

export class ApiError extends Error {
  public readonly status: number;
  public readonly payload: unknown;

  constructor(message: string, status: number, payload?: unknown) {
    super(status === 403 ? NO_PERMISSION_MESSAGE : message);
    this.name = 'ApiError';
    this.status = status;
    this.payload = payload;
  }
}

function getErrorMessage(payload: unknown, fallback: string): string {
  if (!payload || typeof payload !== 'object') {
    return fallback;
  }

  const { message } = payload as NestErrorPayload;
  if (Array.isArray(message)) {
    return message.filter((item) => typeof item === 'string').join(' ');
  }

  return typeof message === 'string' && message.trim() ? message : fallback;
}

async function parseResponse(response: Response): Promise<unknown> {
  const contentType = response.headers.get('content-type');
  if (!contentType?.includes('application/json')) {
    return undefined;
  }

  return response.json();
}

export async function apiRequest<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers = new Headers(options.headers);
  if (options.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  let response: Response;
  try {
    response = await fetch(`${apiUrl}/${path.replace(/^\//, '')}`, {
      ...options,
      headers,
      credentials: 'include',
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw error;
    }

    throw new ApiError(
      'No fue posible comunicarse con el servidor. Verifica tu conexión e intenta nuevamente.',
      0,
    );
  }

  const normalizedPath = path.replace(/^\//, '').split('?')[0].replace(/\/$/, '');
  if (response.status === 401 && !['auth/me', 'auth/login'].includes(normalizedPath)) {
    unauthorizedHandler?.();
  }
  const payload = await parseResponse(response);
  if (!response.ok) {
    throw new ApiError(
      getErrorMessage(payload, 'No fue posible completar la solicitud.'),
      response.status,
      payload,
    );
  }

  return payload as T;
}

export async function apiRequestData<T>(path: string, options: RequestInit = {}): Promise<T> {
  const response = await apiRequest<ApiResponse<T>>(path, options);
  if (!response.success || response.data === undefined) {
    throw new ApiError('La respuesta del servidor no contiene datos válidos.', 0, response);
  }
  return response.data;
}
