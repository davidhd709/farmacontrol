import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import { prisma, cleanTestDatabase } from '../src';

describe('Identidad y Sesiones — Integridad de Persistencia (Integration)', () => {
  beforeAll(async () => {
    // Asegurar que la base de datos de test esté limpia antes de iniciar la suite
    await cleanTestDatabase();
  });

  beforeEach(async () => {
    // Limpieza determinista antes de cada caso de prueba
    await cleanTestDatabase();
  });

  afterAll(async () => {
    await cleanTestDatabase();
    await prisma.$disconnect();
  });

  describe('Modelo User', () => {
    it('debe crear un usuario válido con valores por defecto e id UUID', async () => {
      const user = await prisma.user.create({
        data: {
          username: 'farmaceutico_test',
          passwordHash: '$argon2id$v=19$m=65536,t=3,p=4$dummyhashforintegritytest',
        },
      });

      expect(user.id).toBeDefined();
      expect(typeof user.id).toBe('string');
      // UUID format regex
      expect(user.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
      expect(user.username).toBe('farmaceutico_test');
      expect(user.passwordHash).toBe('$argon2id$v=19$m=65536,t=3,p=4$dummyhashforintegritytest');
      expect(user.isActive).toBe(true);
      expect(user.createdAt).toBeInstanceOf(Date);
      expect(user.updatedAt).toBeInstanceOf(Date);
    });

    it('debe rechazar la creación de usuarios con username duplicado exacto', async () => {
      await prisma.user.create({
        data: {
          username: 'cajero_principal',
          passwordHash: 'hash_uno',
        },
      });

      await expect(
        prisma.user.create({
          data: {
            username: 'cajero_principal',
            passwordHash: 'hash_dos',
          },
        })
      ).rejects.toThrow();
    });

    it('debe rechazar la creación de usuarios con username duplicado insensible a mayúsculas (LOWER)', async () => {
      await prisma.user.create({
        data: {
          username: 'regente_farmacia',
          passwordHash: 'hash_base',
        },
      });

      // Intento de insertar con diferente capitalización 'REGENTE_FARMACIA'
      await expect(
        prisma.user.create({
          data: {
            username: 'REGENTE_FARMACIA',
            passwordHash: 'hash_duplicado_mayuscula',
          },
        })
      ).rejects.toThrow();
    });

    it('permite desactivar usuarios mediante is_active sin eliminarlos físicamente', async () => {
      const user = await prisma.user.create({
        data: {
          username: 'usuario_inactivo',
          passwordHash: 'hash_inactivo',
          isActive: false,
        },
      });

      expect(user.isActive).toBe(false);

      const updated = await prisma.user.update({
        where: { id: user.id },
        data: { isActive: true },
      });

      expect(updated.isActive).toBe(true);
    });
  });

  describe('Modelo Session', () => {
    it('debe crear una sesión válida vinculada a un User existente con tokenHash único', async () => {
      const user = await prisma.user.create({
        data: {
          username: 'sesion_user',
          passwordHash: 'hash_sesion',
        },
      });

      const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 horas

      const session = await prisma.session.create({
        data: {
          userId: user.id,
          tokenHash: 'sha256_mocked_hash_de_token_opaco_1234567890',
          expiresAt,
        },
      });

      expect(session.id).toBeDefined();
      expect(session.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
      expect(session.userId).toBe(user.id);
      expect(session.tokenHash).toBe('sha256_mocked_hash_de_token_opaco_1234567890');
      expect(session.expiresAt).toEqual(expiresAt);
      expect(session.createdAt).toBeInstanceOf(Date);
      expect(session.lastUsedAt).toBeNull();
      expect(session.revokedAt).toBeNull();
    });

    it('debe rechazar la creación de dos sesiones con el mismo tokenHash', async () => {
      const user = await prisma.user.create({
        data: {
          username: 'token_duplicado_user',
          passwordHash: 'hash_token',
        },
      });

      const tokenHash = 'hash_debe_ser_unico_globalmente';

      await prisma.session.create({
        data: {
          userId: user.id,
          tokenHash,
          expiresAt: new Date(Date.now() + 3600 * 1000),
        },
      });

      await expect(
        prisma.session.create({
          data: {
            userId: user.id,
            tokenHash,
            expiresAt: new Date(Date.now() + 3600 * 1000),
          },
        })
      ).rejects.toThrow();
    });

    it('debe rechazar la creación de una sesión si el userId no existe (violación de FK)', async () => {
      const nonExistentUserId = '00000000-0000-0000-0000-000000000099';

      await expect(
        prisma.session.create({
          data: {
            userId: nonExistentUserId,
            tokenHash: 'hash_huerfano',
            expiresAt: new Date(Date.now() + 3600 * 1000),
          },
        })
      ).rejects.toThrow();
    });

    it('debe eliminar en cascada (ON DELETE CASCADE) las sesiones cuando se elimina el usuario', async () => {
      const user = await prisma.user.create({
        data: {
          username: 'user_a_eliminar',
          passwordHash: 'hash_eliminar',
        },
      });

      await prisma.session.create({
        data: {
          userId: user.id,
          tokenHash: 'sesion_1_cascade',
          expiresAt: new Date(Date.now() + 3600 * 1000),
        },
      });

      await prisma.session.create({
        data: {
          userId: user.id,
          tokenHash: 'sesion_2_cascade',
          expiresAt: new Date(Date.now() + 3600 * 1000),
        },
      });

      // Verificar que existen 2 sesiones
      const sessionsBefore = await prisma.session.findMany({ where: { userId: user.id } });
      expect(sessionsBefore.length).toBe(2);

      // Eliminar el usuario
      await prisma.user.delete({ where: { id: user.id } });

      // Verificar que las sesiones fueron eliminadas en cascada por PostgreSQL
      const sessionsAfter = await prisma.session.findMany({ where: { userId: user.id } });
      expect(sessionsAfter.length).toBe(0);
    });

    it('permite registrar lastUsedAt y revokedAt para el ciclo de vida de la sesión', async () => {
      const user = await prisma.user.create({
        data: {
          username: 'user_lifecycle',
          passwordHash: 'hash_lifecycle',
        },
      });

      const session = await prisma.session.create({
        data: {
          userId: user.id,
          tokenHash: 'token_lifecycle',
          expiresAt: new Date(Date.now() + 3600 * 1000),
        },
      });

      const usedTime = new Date();
      const revokedTime = new Date(Date.now() + 1000);

      const updated = await prisma.session.update({
        where: { id: session.id },
        data: {
          lastUsedAt: usedTime,
          revokedAt: revokedTime,
        },
      });

      expect(updated.lastUsedAt).toEqual(usedTime);
      expect(updated.revokedAt).toEqual(revokedTime);
    });
  });
});
