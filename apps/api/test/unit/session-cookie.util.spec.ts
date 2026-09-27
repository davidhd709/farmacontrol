import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  SESSION_COOKIE_NAME,
  getSessionCookieOptions,
  getClearSessionCookieOptions,
  extractTokenFromCookieHeader,
} from '../../src/modules/identity/presentation/utils/session-cookie.util';
import { DEFAULT_SESSION_DURATION_MS } from '../../src/modules/identity/application/services/session.service';

describe('session-cookie.util (Unit)', () => {
  const originalEnv = process.env.NODE_ENV;

  afterEach(() => {
    process.env.NODE_ENV = originalEnv;
  });

  describe('Constantes de Cookie', () => {
    it('debe definir el nombre canónico de la cookie como "sid"', () => {
      expect(SESSION_COOKIE_NAME).toBe('sid');
    });
  });

  describe('getSessionCookieOptions', () => {
    it('debe configurar atributos seguros por defecto (HttpOnly, SameSite=Lax, Path=/, maxAge=24h)', () => {
      const options = getSessionCookieOptions(false);

      expect(options.httpOnly).toBe(true);
      expect(options.sameSite).toBe('lax');
      expect(options.path).toBe('/');
      expect(options.secure).toBe(false);
      expect(options.maxAge).toBe(DEFAULT_SESSION_DURATION_MS);
      expect(options.maxAge).toBe(24 * 60 * 60 * 1000); // 24 horas
    });

    it('debe activar Secure: true cuando isProduction es true', () => {
      const options = getSessionCookieOptions(true);
      expect(options.secure).toBe(true);
    });

    it('debe leer NODE_ENV === "production" para activar Secure si no se pasa parámetro', () => {
      process.env.NODE_ENV = 'production';
      const prodOptions = getSessionCookieOptions();
      expect(prodOptions.secure).toBe(true);

      process.env.NODE_ENV = 'development';
      const devOptions = getSessionCookieOptions();
      expect(devOptions.secure).toBe(false);

      process.env.NODE_ENV = 'test';
      const testOptions = getSessionCookieOptions();
      expect(testOptions.secure).toBe(false);
    });
  });

  describe('getClearSessionCookieOptions', () => {
    it('debe retornar opciones compatibles para limpiar la cookie en logout', () => {
      const options = getClearSessionCookieOptions(false);

      expect(options.httpOnly).toBe(true);
      expect(options.sameSite).toBe('lax');
      expect(options.path).toBe('/');
      expect(options.secure).toBe(false);
      expect(options.maxAge).toBeUndefined();
    });

    it('debe mantener Secure: true en producción al limpiar la cookie', () => {
      const options = getClearSessionCookieOptions(true);
      expect(options.secure).toBe(true);
    });
  });

  describe('extractTokenFromCookieHeader', () => {
    const validRawToken = 'a'.repeat(64);

    it('debe retornar null si la cabecera cookie es undefined o vacía', () => {
      expect(extractTokenFromCookieHeader(undefined)).toBeNull();
      expect(extractTokenFromCookieHeader('')).toBeNull();
      // @ts-expect-error validación runtime
      expect(extractTokenFromCookieHeader(null)).toBeNull();
      // @ts-expect-error validación runtime
      expect(extractTokenFromCookieHeader(123)).toBeNull();
    });

    it('debe retornar el token cuando la cookie sid está presente de forma única', () => {
      const header = `sid=${validRawToken}`;
      expect(extractTokenFromCookieHeader(header)).toBe(validRawToken);
    });

    it('debe manejar múltiples cookies con espacios y separadores punto y coma', () => {
      const header = `theme=dark;   sid=${validRawToken};  lang=es`;
      expect(extractTokenFromCookieHeader(header)).toBe(validRawToken);
    });

    it('debe retornar null si la cabecera contiene cookies pero ninguna es sid', () => {
      const header = 'theme=dark; lang=es; user_pref=tabular';
      expect(extractTokenFromCookieHeader(header)).toBeNull();
    });

    it('debe retornar null si la cookie sid tiene un valor vacío', () => {
      const header = 'theme=dark; sid=; lang=es';
      expect(extractTokenFromCookieHeader(header)).toBe('');
    });

    it('debe decodificar correctamente percent-encoding válido', () => {
      const encodedToken = encodeURIComponent(validRawToken);
      const header = `sid=${encodedToken}`;
      expect(extractTokenFromCookieHeader(header)).toBe(validRawToken);
    });

    it('debe retornar null sin lanzar URIError ante percent-encoding malformado como sid=% (F-25)', () => {
      expect(extractTokenFromCookieHeader('sid=%')).toBeNull();
      expect(extractTokenFromCookieHeader('sid=%E0%A4%A')).toBeNull();
      expect(extractTokenFromCookieHeader('theme=dark; sid=%99; lang=es')).toBeNull();
    });

    it('debe retornar el primer sid de forma determinista ante cookies duplicadas', () => {
      const firstToken = '1'.repeat(64);
      const secondToken = '2'.repeat(64);
      const header = `sid=${firstToken}; other=123; sid=${secondToken}`;

      // Contrato determinista: toma la primera ocurrencia encontrada
      expect(extractTokenFromCookieHeader(header)).toBe(firstToken);
    });

    it('debe ignorar entradas sin delimitador igual (=)', () => {
      const header = `malformed_entry; sid=${validRawToken}`;
      expect(extractTokenFromCookieHeader(header)).toBe(validRawToken);
    });
  });
});
