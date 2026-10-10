import type { NestExpressApplication } from '@nestjs/platform-express';

/**
 * Interpreta TRUST_PROXY para Express. Sin valor no se confía en ningún proxy: req.ip es
 * la conexión directa y una cabecera X-Forwarded-For enviada por el cliente se ignora.
 * Detrás de Caddy se usa `1` (un salto): req.ip es la IP que Caddy escribió.
 */
export function parseTrustProxy(raw: string | undefined): boolean | number | string {
  const value = raw?.trim();
  if (!value || value === 'false') return false;
  if (/^\d+$/.test(value)) return Number(value);
  // Lista de IPs o subredes de proxies conocidos (ej. "loopback, 172.16.0.0/12")
  return value;
}

/** Ajustes HTTP comunes a la API en ejecución y a las pruebas de integración. */
export function configureHttpApp(app: NestExpressApplication): void {
  app.set('trust proxy', parseTrustProxy(process.env.TRUST_PROXY));
  app.disable('x-powered-by');
}
