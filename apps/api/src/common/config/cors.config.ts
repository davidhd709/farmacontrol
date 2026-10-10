import type { CorsOptions } from '@nestjs/common/interfaces/external/cors-options.interface';

/**
 * Obtiene la configuración de CORS endurecida para la API REST.
 * Valida los orígenes permitidos contra una lista blanca explícita,
 * soportando orígenes de desarrollo local y variables de entorno para producción.
 */
export function getCorsConfig(): CorsOptions {
  const envOrigins = (process.env.CORS_ALLOWED_ORIGINS || '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

  // Los orígenes de desarrollo local nunca se aceptan en producción
  const isProduction = process.env.NODE_ENV === 'production';
  const developmentOrigins = [
    'http://localhost:5173',
    'http://127.0.0.1:5173',
    'http://localhost:3000',
    'http://127.0.0.1:3000',
    'http://localhost:4173',
    'http://127.0.0.1:4173',
  ];

  const allowedOrigins = Array.from(
    new Set([...(isProduction ? [] : developmentOrigins), ...envOrigins]),
  );

  return {
    origin: (requestOrigin, callback) => {
      // Permitir peticiones sin encabezado Origin (curl, server-to-server, scripts internos)
      if (!requestOrigin) {
        return callback(null, true);
      }

      if (allowedOrigins.includes(requestOrigin)) {
        return callback(null, true);
      }

      // Sin cabeceras CORS el navegador bloquea la respuesta; lanzar un Error daría un 500
      return callback(null, false);
    },
    credentials: true,
    methods: ['GET', 'HEAD', 'PUT', 'PATCH', 'POST', 'DELETE', 'OPTIONS'],
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'X-Correlation-Id',
      'x-correlation-id',
      'Accept',
      'Origin',
      'Idempotency-Key',
    ],
    exposedHeaders: ['X-Correlation-Id', 'x-correlation-id', 'Retry-After'],
    maxAge: 86400, // Cache de preflight por 24 horas
  };
}
