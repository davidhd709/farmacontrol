import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import { prisma, cleanTestDatabase } from '@farmacia/database';
import { PrismaSessionRepository } from '../../src/modules/identity/infrastructure/adapters/prisma-session.repository';
import { PrismaUserRepository } from '../../src/modules/identity/infrastructure/adapters/prisma-user.repository';
import { CryptoSessionTokenAdapter } from '../../src/modules/identity/infrastructure/adapters/crypto-session-token.adapter';
import { Session } from '../../src/modules/identity/domain/entities/session.entity';
import { User } from '../../src/modules/identity/domain/entities/user.entity';
import { Username } from '../../src/modules/identity/domain/value-objects/username.vo';

describe('PrismaSessionRepository (Integration with PostgreSQL)', () => {
  const sessionRepository = new PrismaSessionRepository(prisma);
  const userRepository = new PrismaUserRepository(prisma);
  const tokenAdapter = new CryptoSessionTokenAdapter();

  beforeAll(async () => {
    await cleanTestDatabase();
  });

  beforeEach(async () => {
    await cleanTestDatabase();
  });

  afterAll(async () => {
    await cleanTestDatabase();
    await prisma.$disconnect();
  });

  async function createTestUser(username = 'cajero_test'): Promise<User> {
    const user = User.create({
      username: Username.create(username),
      passwordHash: '$argon2id$v=19$m=65536,t=3,p=4$dummyhashforintegration',
    });
    return userRepository.create(user);
  }

  it('debe persistir una entidad Session y recuperarla por ID y por tokenHash', async () => {
    const user = await createTestUser('farmaceutico_sesion');
    const { rawToken, tokenHash } = tokenAdapter.generate();
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

    const domainSession = Session.create({
      userId: user.id!,
      tokenHash,
      expiresAt,
    });

    const created = await sessionRepository.create(domainSession);

    expect(created.id).toBeDefined();
    expect(created.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    );
    expect(created.userId).toBe(user.id);
    expect(created.tokenHash).toBe(tokenHash);
    expect(created.expiresAt).toEqual(expiresAt);
    expect(created.createdAt).toBeInstanceOf(Date);
    expect(created.lastUsedAt).toBeUndefined();
    expect(created.revokedAt).toBeUndefined();

    // 1. Recuperar por ID
    const foundById = await sessionRepository.findById(created.id!);
    expect(foundById).not.toBeNull();
    expect(foundById!.id).toBe(created.id);
    expect(foundById!.tokenHash).toBe(tokenHash);

    // 2. Recuperar por tokenHash calculado a partir del rawToken
    const calculatedHash = tokenAdapter.hash(rawToken);
    const foundByHash = await sessionRepository.findByTokenHash(calculatedHash);
    expect(foundByHash).not.toBeNull();
    expect(foundByHash!.id).toBe(created.id);
    expect(foundByHash!.userId).toBe(user.id);
    expect(foundByHash!.isValid()).toBe(true);

    // 3. Confirmar que el rawToken original NO está guardado en PostgreSQL
    const rawDbRecord = await prisma.session.findUnique({
      where: { id: created.id },
    });
    expect(rawDbRecord).not.toBeNull();
    expect(rawDbRecord!.tokenHash).toBe(tokenHash);
    expect(rawDbRecord!.tokenHash).not.toBe(rawToken);
  });

  it('debe rechazar la persistencia de dos sesiones con el mismo tokenHash (restricción UNIQUE)', async () => {
    const user = await createTestUser('user_duplicate_hash');
    const { tokenHash } = tokenAdapter.generate();
    const expiresAt = new Date(Date.now() + 3600 * 1000);

    const session1 = Session.create({
      userId: user.id!,
      tokenHash,
      expiresAt,
    });

    await sessionRepository.create(session1);

    const session2 = Session.create({
      userId: user.id!,
      tokenHash,
      expiresAt,
    });

    await expect(sessionRepository.create(session2)).rejects.toThrow();
  });

  it('debe actualizar correctamente lastUsedAt y revokedAt de una sesión', async () => {
    const user = await createTestUser('user_session_update');
    const { tokenHash } = tokenAdapter.generate();
    const expiresAt = new Date(Date.now() + 3600 * 1000);

    const session = await sessionRepository.create(
      Session.create({
        userId: user.id!,
        tokenHash,
        expiresAt,
      })
    );

    const usageTime = new Date();
    session.recordUsage(usageTime);
    session.revoke();

    const updated = await sessionRepository.update(session);

    expect(updated.lastUsedAt).toEqual(usageTime);
    expect(updated.revokedAt).toBeInstanceOf(Date);
    expect(updated.isRevoked()).toBe(true);
    expect(updated.isValid()).toBe(false);

    // Verificar en base de datos
    const inDb = await sessionRepository.findById(session.id!);
    expect(inDb!.lastUsedAt).toEqual(usageTime);
    expect(inDb!.revokedAt).toBeInstanceOf(Date);
    expect(inDb!.isValid()).toBe(false);
  });

  it('debe eliminar una sesión específica con delete(id)', async () => {
    const user = await createTestUser('user_delete_session');
    const { tokenHash } = tokenAdapter.generate();

    const session = await sessionRepository.create(
      Session.create({
        userId: user.id!,
        tokenHash,
        expiresAt: new Date(Date.now() + 3600 * 1000),
      })
    );

    await sessionRepository.delete(session.id!);

    const inDb = await sessionRepository.findById(session.id!);
    expect(inDb).toBeNull();
  });

  it('debe eliminar todas las sesiones de un usuario con deleteByUserId(userId)', async () => {
    const user = await createTestUser('user_multi_session');

    // Crear 3 sesiones para el mismo usuario
    for (let i = 0; i < 3; i++) {
      const { tokenHash } = tokenAdapter.generate();
      await sessionRepository.create(
        Session.create({
          userId: user.id!,
          tokenHash,
          expiresAt: new Date(Date.now() + 3600 * 1000),
        })
      );
    }

    const deletedCount = await sessionRepository.deleteByUserId(user.id!);
    expect(deletedCount).toBe(3);

    const remainingSessions = await prisma.session.findMany({
      where: { userId: user.id },
    });
    expect(remainingSessions).toHaveLength(0);
  });

  it('debe eliminar en cascada las sesiones cuando el usuario es eliminado en PostgreSQL (ON DELETE CASCADE)', async () => {
    const user = await createTestUser('user_cascade_test');
    const { tokenHash } = tokenAdapter.generate();

    const session = await sessionRepository.create(
      Session.create({
        userId: user.id!,
        tokenHash,
        expiresAt: new Date(Date.now() + 3600 * 1000),
      })
    );

    // Eliminar el usuario en PostgreSQL
    await prisma.user.delete({
      where: { id: user.id },
    });

    // La sesión debe haber desaparecido en cascada
    const inDb = await sessionRepository.findById(session.id!);
    expect(inDb).toBeNull();
  });
});
