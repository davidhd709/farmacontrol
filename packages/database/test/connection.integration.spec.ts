import { describe, it, expect, afterAll } from 'vitest';
import {
  prisma,
  checkDatabaseConnection,
  validateTestDatabaseUrl,
  extractDatabaseName,
} from '../src/client';

describe('PostgreSQL Database Isolation & Connection (Integration)', () => {
  afterAll(async () => {
    await prisma.$disconnect();
  });

  describe('Conectividad con base de datos de pruebas real', () => {
    it('debe conectarse estrictamente a farmacia_test y ejecutar SELECT 1 sin modificar datos', async () => {
      const result = await checkDatabaseConnection();

      expect(result.ok).toBe(true);
      expect(result.durationMs).toBeGreaterThan(0);
      expect(result.message).toContain('Conexión exitosa contra PostgreSQL 18');
      expect(result.databaseName).toBe('farmacia_test');

      const queryRows = result.result as Array<{ connection_status: number; current_db: string }>;
      expect(Array.isArray(queryRows)).toBe(true);
      expect(queryRows.length).toBe(1);
      expect(queryRows[0].connection_status).toBe(1);
      expect(queryRows[0].current_db).toBe('farmacia_test');
    });

    it('debe confirmar mediante consulta directa que current_database() es exactamente farmacia_test', async () => {
      const rows = await prisma.$queryRaw<Array<{ current_db: string; ping: number }>>`
        SELECT current_database() as current_db, 1 as ping
      `;

      expect(Array.isArray(rows)).toBe(true);
      expect(rows.length).toBe(1);
      expect(rows[0].current_db).toBe('farmacia_test');
      expect(rows[0].ping).toBe(1);
    });
  });

  describe('Protección defensiva contra bases de datos no destinadas a testing', () => {
    it('debe extraer el nombre de la base de datos de forma limpia sin exponer credenciales', () => {
      const url = 'postgresql://usuario_privado:secreto_super_seguro@localhost:5434/farmacia_db?schema=public';
      expect(extractDatabaseName(url)).toBe('farmacia_db');
    });

    it('debe ACEPTAR URLs que apunten a farmacia_test o que terminen en _test', () => {
      expect(() =>
        validateTestDatabaseUrl('postgresql://user:pass@localhost:5434/farmacia_test?schema=public')
      ).not.toThrow();

      expect(() =>
        validateTestDatabaseUrl('postgresql://user:pass@localhost:5434/otra_base_test?schema=public')
      ).not.toThrow();
    });

    it('debe RECHAZAR explícitamente cualquier configuración que apunte a farmacia_db (base de desarrollo)', () => {
      const devUrl = 'postgresql://farmacia_user:secret_pass@localhost:5434/farmacia_db?schema=public';

      expect(() => validateTestDatabaseUrl(devUrl)).toThrowError(
        '[Seguridad] Operación de pruebas rechazada: la base de datos configurada "farmacia_db" no es una base de datos de pruebas válida'
      );

      // Comprobar que el mensaje de error NUNCA expone la contraseña o credenciales
      try {
        validateTestDatabaseUrl(devUrl);
      } catch (err) {
        const message = (err as Error).message;
        expect(message).not.toContain('secret_pass');
        expect(message).not.toContain('farmacia_user');
      }
    });

    it('debe RECHAZAR cualquier configuración que apunte a bases de producción u otros nombres', () => {
      const prodUrl = 'postgresql://admin:super_secret@remotehost:5432/farmacia_prod?schema=public';

      expect(() => validateTestDatabaseUrl(prodUrl)).toThrowError(
        '[Seguridad] Operación de pruebas rechazada: la base de datos configurada "farmacia_prod" no es una base de datos de pruebas válida'
      );
    });
  });
});
